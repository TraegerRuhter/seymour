import type { ParsedRecipeData, ParseResult } from './types';
import {
  extractRecipeFromHtml,
  extractRecipeFromMicrodata,
  FetchError,
  fetchHtml,
  fetchViaReader,
  htmlToText,
} from './scrape';
import { extractRecipeViaAI } from './ai-extract';
import { assertPublicHostname, UnsafeUrlError } from './url-safety';

/**
 * One URL → one recipe, or a reason it failed. Shared by the "paste URLs"
 * import route and the "discover recipes" route — both need the exact same
 * fetch → JSON-LD → microdata → AI-extraction pipeline, just with different
 * sources for the candidate URLs (typed by the user vs. suggested by an LLM).
 */

// Reader-proxy fallback for sites that block direct server-side fetches
// (Cloudflare et al. reject datacenter IPs). Defaults to Jina AI Reader, which
// fetches the page from its own infrastructure and returns the HTML.
// Override with a custom `{url}` template, or set RECIPE_READER_PROXY=off to
// disable third-party calls entirely.
const DEFAULT_READER_PROXY = 'https://r.jina.ai/{url}';
function resolveReaderProxy(): string {
  const raw = process.env.RECIPE_READER_PROXY;
  if (raw === undefined) return DEFAULT_READER_PROXY;
  const v = raw.trim();
  if (v === '' || v.toLowerCase() === 'off' || v.toLowerCase() === 'none') return '';
  return v;
}
const READER_PROXY = resolveReaderProxy();

/** Turns a fetch failure into an honest, actionable message for the user. */
function fetchErrorMessage(e: unknown): string {
  if (e instanceof FetchError) {
    switch (e.failure) {
      case 'blocked':
        return 'This site blocks automated access, so Seymour can’t read it directly (many big sites like Allrecipes do this). Use “Enter manually” to add it.';
      case 'notfound':
        return 'That page wasn’t found (404). Double-check the URL.';
      case 'timeout':
        return 'The page took too long to respond. Try again, or add it with “Enter manually”.';
    }
  }
  return 'The page couldn’t be fetched. Try again, or add it with “Enter manually”.';
}

/** Runs the JSON-LD scraper, then the microdata scraper, then the AI fallback against one HTML document. */
async function extractFrom(
  html: string,
  href: string,
): Promise<{ data: ParsedRecipeData; via: 'scraper' | 'ai' } | null> {
  const scraped = extractRecipeFromHtml(html, href) ?? extractRecipeFromMicrodata(html, href);
  if (scraped) return { data: scraped, via: 'scraper' };
  try {
    const ai = await extractRecipeViaAI({ text: htmlToText(html), sourceUrl: href });
    if (ai) return { data: ai, via: 'ai' };
  } catch {
    // fall through
  }
  return null;
}

/** Fetches one URL and extracts a recipe from it, trying the reader-proxy fallback if the direct fetch fails. */
export async function parseOne(url: string): Promise<ParseResult> {
  let target: URL;
  try {
    target = new URL(url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    return { status: 'error', url, message: 'Not a valid http(s) URL.' };
  }

  // Refuse to fetch anything that resolves to a private/internal address —
  // this server-side fetch is reachable by anyone who can call the API, so
  // without this check it doubles as an open proxy into internal services.
  try {
    await assertPublicHostname(target.hostname);
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return { status: 'error', url, message: 'Not a valid http(s) URL.' };
    }
    throw e;
  }

  // 1) Direct fetch, then extract.
  let directError: unknown;
  try {
    const html = await fetchHtml(target.href);
    const result = await extractFrom(html, target.href);
    if (result) return { status: 'success', url, data: result.data, via: result.via };
  } catch (e) {
    directError = e;
  }

  // 2) Reader-proxy fallback (only if configured) — covers pages that block a
  // direct fetch or serve a bot shell with no recipe data.
  if (READER_PROXY) {
    try {
      const html = await fetchViaReader(target.href, READER_PROXY);
      const result = await extractFrom(html, target.href);
      if (result) return { status: 'success', url, data: result.data, via: result.via };
    } catch (e) {
      if (!directError) directError = e;
    }
  }

  // 3) Nothing worked — report the most useful reason.
  if (directError) {
    return { status: 'error', url, message: fetchErrorMessage(directError) };
  }
  return {
    status: 'error',
    url,
    message: process.env.OPENAI_API_KEY
      ? 'No recipe could be extracted from this page. You can add it with “Enter manually”.'
      : 'No structured recipe data found on this page. You can add it with “Enter manually”.',
  };
}
