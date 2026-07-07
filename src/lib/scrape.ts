import type { ParsedRecipeData } from './types';

/**
 * Server-side recipe extraction.
 *
 * Primary path: schema.org Recipe structured data embedded as JSON-LD, which
 * the vast majority of recipe sites publish (it's what Google requires for
 * rich results, and what scraper libraries read under the hood).
 *
 * Fallback path (route-level): OpenAI extraction from the page text.
 */

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Seymour/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls the contents of every <script type="application/ld+json"> block. */
function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Some sites embed invalid JSON (trailing commas, HTML comments); try a
      // light cleanup before giving up on the block.
      try {
        blocks.push(JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')));
      } catch {
        /* skip block */
      }
    }
  }
  return blocks;
}

function isRecipeNode(node: unknown): node is Record<string, unknown> {
  if (typeof node !== 'object' || node === null) return false;
  const t = (node as Record<string, unknown>)['@type'];
  if (typeof t === 'string') return t.toLowerCase() === 'recipe';
  if (Array.isArray(t)) return t.some((x) => typeof x === 'string' && x.toLowerCase() === 'recipe');
  return false;
}

/** Walks JSON-LD (including @graph and arrays) looking for a Recipe node. */
function findRecipeNode(data: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || data === null || typeof data !== 'object') return null;
  if (isRecipeNode(data)) return data;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = data as Record<string, unknown>;
  if (obj['@graph']) return findRecipeNode(obj['@graph'], depth + 1);
  if (obj.mainEntity) return findRecipeNode(obj.mainEntity, depth + 1);
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  frac12: '½', frac14: '¼', frac34: '¾',
  frac13: '⅓', frac23: '⅔', frac18: '⅛', frac38: '⅜', frac58: '⅝', frac78: '⅞',
  deg: '°', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é', egrave: 'è',
};

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&([a-zA-Z]+\d*);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function decodeEntities(s: string): string {
  return decodeBasicEntities(s)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asText(value: unknown): string {
  if (typeof value === 'string') return decodeEntities(value);
  if (typeof value === 'number') return String(value);
  return '';
}

function extractImage(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return extractImage(value[0]);
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.contentUrl === 'string') return obj.contentUrl;
  }
  return undefined;
}

function extractInstructions(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === 'string') {
    // Single blob: split on newlines / numbered steps.
    return decodeEntitiesMultiline(value)
      .split(/\n+/)
      .map((s) => s.replace(/^\s*(?:step\s*)?\d+[.):]\s*/i, '').trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((v) => extractInstructions(v, depth + 1));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const type = typeof obj['@type'] === 'string' ? (obj['@type'] as string).toLowerCase() : '';
    if (type === 'howtosection' && obj.itemListElement) {
      const name = asText(obj.name);
      const steps = extractInstructions(obj.itemListElement, depth + 1);
      return name ? [`${name}:`, ...steps] : steps;
    }
    if (obj.itemListElement) return extractInstructions(obj.itemListElement, depth + 1);
    const text = asText(obj.text) || asText(obj.name);
    return text ? [text] : [];
  }
  return [];
}

function decodeEntitiesMultiline(s: string): string {
  return decodeBasicEntities(
    s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

/**
 * Attempts structured-data extraction from a page's HTML.
 * Returns null when no usable schema.org Recipe is present.
 */
export function extractRecipeFromHtml(html: string, sourceUrl: string): ParsedRecipeData | null {
  for (const block of extractJsonLdBlocks(html)) {
    const node = findRecipeNode(block);
    if (!node) continue;

    const rawIngredients = node.recipeIngredient ?? node.ingredients;
    const ingredientLines = Array.isArray(rawIngredients)
      ? rawIngredients.map(asText).filter(Boolean)
      : [];
    if (ingredientLines.length === 0) continue;

    const title = asText(node.name) || asText(node.headline);
    const instructions = extractInstructions(node.recipeInstructions);

    return {
      title: title || 'Untitled recipe',
      sourceUrl,
      imageUrl: extractImage(node.image),
      ingredientLines,
      instructions,
    };
  }
  return null;
}

/** Rough HTML → text for the AI fallback prompt (keeps token usage sane). */
export function htmlToText(html: string, maxChars = 24_000): string {
  const text = decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return text.slice(0, maxChars);
}
