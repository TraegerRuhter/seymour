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

const FETCH_TIMEOUT_MS = 12_000;

/** Why a fetch failed, so the API can give an honest, actionable message. */
export type FetchFailure = 'timeout' | 'blocked' | 'notfound' | 'network';

export class FetchError extends Error {
  constructor(
    public failure: FetchFailure,
    public status?: number,
  ) {
    super(`fetch ${failure}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'FetchError';
  }
}

function classifyStatus(status: number): FetchFailure {
  if (status === 404 || status === 410) return 'notfound';
  // 401/403 = forbidden, 406 = UA rejected, 429 = rate-limited, 503 = Cloudflare challenge
  if (status === 401 || status === 403 || status === 406 || status === 429 || status === 503) {
    return 'blocked';
  }
  return 'network';
}

// Precompile regexes at module level to avoid recompilation on every call
const JSON_LD_REGEX = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const INVALID_JSON_CLEANUP_REGEX = /,\s*([}\]])/g;
const BR_REGEX = /<br\s*\/?>/gi;
const END_P_REGEX = /<\/p>/gi;
const TAG_REGEX = /<[^>]+>/g;
const STEP_NUMBER_REGEX = /^\s*(?:step\s*)?\d+[.):]\s*/i;
const SCRIPT_REGEX = /<script[\s\S]*?<\/script>/gi;
const STYLE_REGEX = /<style[\s\S]*?<\/style>/gi;
const NAV_REGEX = /<nav[\s\S]*?<\/nav>/gi;
const FOOTER_REGEX = /<footer[\s\S]*?<\/footer>/gi;
const SPACE_REGEX = /[ \t]+/g;
const NEWLINE_REGEX = /\n\s*\n+/g;

// A realistic, current desktop-Chrome header set. Many recipe sites do light
// bot-checking on the User-Agent / Accept headers; sending a plausible browser
// fingerprint gets us past a meaningful share of them. (Cloudflare-grade bot
// protection — e.g. Allrecipes, NYT — still can't be defeated this way.)
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

export async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: BROWSER_HEADERS,
      redirect: 'follow',
    });
    if (!res.ok) throw new FetchError(classifyStatus(res.status), res.status);
    return await res.text();
  } catch (e) {
    if (e instanceof FetchError) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new FetchError('timeout');
    throw new FetchError('network');
  } finally {
    clearTimeout(timer);
  }
}

// Reader proxies render/fetch a page from their own infrastructure and hand
// back the HTML, which sidesteps datacenter-IP blocks (Cloudflare et al.) that
// stop a direct server-side fetch. Rendering is slower, so allow more time.
const READER_TIMEOUT_MS = 25_000;

/**
 * Fetches a page through a configured reader proxy. `template` is a URL with a
 * `{url}` placeholder (e.g. `https://r.jina.ai/{url}`); if it has no
 * placeholder the target URL is appended. Returns HTML for the normal
 * JSON-LD/AI extraction path to consume.
 */
export async function fetchViaReader(url: string, template: string): Promise<string> {
  // The target URL is inserted raw (Jina and most readers use path-style
  // append, e.g. https://r.jina.ai/https://site.com/recipe).
  const proxied = template.includes('{url}') ? template.replace('{url}', url) : template + url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READER_TIMEOUT_MS);
  try {
    const res = await fetch(proxied, {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_HEADERS['User-Agent'],
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        // Jina Reader honors this to return raw HTML (so the JSON-LD scraper
        // works); harmless to proxies that ignore it.
        'X-Return-Format': 'html',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new FetchError(classifyStatus(res.status), res.status);
    return await res.text();
  } catch (e) {
    if (e instanceof FetchError) throw e;
    if (e instanceof Error && e.name === 'AbortError') throw new FetchError('timeout');
    throw new FetchError('network');
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls the contents of every <script type="application/ld+json"> block. */
function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  // Reset regex state for global flag
  JSON_LD_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JSON_LD_REGEX.exec(html)) !== null) {
    const raw = m[1].trim();
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Some sites embed invalid JSON (trailing commas, HTML comments); try a
      // light cleanup before giving up on the block.
      try {
        blocks.push(JSON.parse(raw.replace(INVALID_JSON_CLEANUP_REGEX, '$1')));
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
    .replace(TAG_REGEX, '')
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
      .map((s) => s.replace(STEP_NUMBER_REGEX, '').trim())
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
      .replace(BR_REGEX, '\n')
      .replace(END_P_REGEX, '\n')
      .replace(TAG_REGEX, ''),
  );
}

/**
 * Attempts structured-data extraction from a page's HTML.
 * Returns null when no usable schema.org Recipe is present.
 * 
 * Exits early after finding the first valid recipe to avoid parsing
 * unnecessary JSON-LD blocks.
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

// --- Microdata (schema.org itemprop) fallback ---
// Some sites — mostly older or hand-built WordPress themes — mark up their
// recipe with HTML microdata (itemscope/itemprop) instead of JSON-LD, or
// alongside a JSON-LD block that only carries a title/rating for rich
// snippets and omits the ingredients/instructions entirely (seen in the
// wild: a "recipe" JSON-LD node with just name/image/aggregateRating, while
// the real ingredient list lives in itemprop="recipeIngredient" <li>s
// further down the page). Regex-based like the rest of this module — it
// doesn't balance nested tags, so it can't safely bound an itemscope's outer
// extent, but a recipe card is normally a flat block, which this covers.
const MICRODATA_RECIPE_TYPE_RE = /itemtype\s*=\s*["'](?:https?:)?\/\/schema\.org\/Recipe["']/i;

function tagsWithAttr(html: string, tagPattern: string): string[] {
  const re = new RegExp(`<(?:${tagPattern})\\b[^>]*>`, 'gi');
  return html.match(re) ?? [];
}

function extractMicrodataImage(html: string): string | undefined {
  for (const tag of tagsWithAttr(html, 'img')) {
    if (!/itemprop\s*=\s*["'][^"']*\bimage\b[^"']*["']/i.test(tag)) continue;
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (src) return src[1];
  }
  return undefined;
}

/** Elements individually tagged with `itemprop="<prop> ..."` (space-separated values are valid microdata). */
function microdataPropElements(html: string, prop: string): string[] {
  const re = new RegExp(
    `<(li|p|span|div)\\b[^>]*\\bitemprop\\s*=\\s*["'][^"']*\\b${prop}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'gi',
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = decodeEntities(m[2]);
    if (text) out.push(text);
  }
  return out;
}

function extractMicrodataIngredients(html: string): string[] {
  return microdataPropElements(html, 'recipeIngredient');
}

/**
 * `itemprop="recipeInstructions"` is used two ways in the wild: on each
 * individual step, or on a single wrapping container whose <ol>/<ul> holds
 * the real steps. `microdataPropElements` handles the first case; a
 * container match yields exactly one (garbled, all-steps-mashed-together)
 * "element" for it to find, so a result length of 1 signals the second case
 * and we fall back to reading the first list found after that point.
 */
function extractMicrodataInstructions(html: string): string[] {
  const direct = microdataPropElements(html, 'recipeInstructions');
  if (direct.length > 1) return direct;

  const container = /\bitemprop\s*=\s*["'][^"']*\brecipeInstructions\b[^"']*["']/i.exec(html);
  if (!container) return direct;
  const list = /<(ol|ul)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(html.slice(container.index));
  if (!list) return direct;

  const steps: string[] = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(list[2])) !== null) {
    const text = decodeEntities(m[1]);
    if (text) steps.push(text);
  }
  return steps.length ? steps : direct;
}

/** Attempts schema.org Recipe extraction from HTML microdata. Returns null when no usable itemprop="recipeIngredient" data is present. */
export function extractRecipeFromMicrodata(html: string, sourceUrl: string): ParsedRecipeData | null {
  if (!MICRODATA_RECIPE_TYPE_RE.test(html)) return null;

  const ingredientLines = extractMicrodataIngredients(html);
  if (ingredientLines.length === 0) return null;

  const nameMatch = /<[^>]+\bitemprop\s*=\s*["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(html);
  const title = nameMatch ? decodeEntities(nameMatch[1]) : '';

  return {
    title: title || 'Untitled recipe',
    sourceUrl,
    imageUrl: extractMicrodataImage(html),
    ingredientLines,
    instructions: extractMicrodataInstructions(html),
  };
}

/** Rough HTML → text for the AI fallback prompt (keeps token usage sane). */
export function htmlToText(html: string, maxChars = 24_000): string {
  const text = decodeBasicEntities(
    html
      .replace(SCRIPT_REGEX, ' ')
      .replace(STYLE_REGEX, ' ')
      .replace(NAV_REGEX, ' ')
      .replace(FOOTER_REGEX, ' ')
      .replace(BR_REGEX, '\n')
      .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, '\n')
      .replace(TAG_REGEX, ' '),
  )
    .replace(SPACE_REGEX, ' ')
    .replace(NEWLINE_REGEX, '\n')
    .trim();
  return text.slice(0, maxChars);
}