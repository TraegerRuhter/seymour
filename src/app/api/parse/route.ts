import { NextRequest, NextResponse } from 'next/server';
import type { ParsedRecipeData, ParseResult } from '@/lib/types';
import { extractRecipeFromHtml, fetchHtml, htmlToText } from '@/lib/scrape';

export const runtime = 'nodejs';

const MAX_URLS_PER_REQUEST = 10;

// Simple in-memory rate limit: N parses per IP per minute. Resets on cold
// start, which is fine for a personal single-user app.
const RATE_LIMIT = 30;
const rateWindow = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateWindow.get(ip);
  if (!entry || now > entry.resetAt) {
    rateWindow.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

async function aiFallback(url: string, html: string): Promise<ParsedRecipeData | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const pageText = htmlToText(html);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract recipes from web page text. Respond ONLY with JSON of shape ' +
            '{"title": string, "imageUrl": string|null, "ingredientLines": string[], "instructions": string[]}. ' +
            'ingredientLines are the raw ingredient strings exactly as written (one per entry, including quantities and units). ' +
            'instructions are the preparation steps in order, one step per entry. ' +
            'If the page contains no recipe, respond {"title": null}.',
        },
        { role: 'user', content: `Page URL: ${url}\n\nPage text:\n${pageText}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI fallback failed: HTTP ${res.status}`);

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content) as {
    title?: string | null;
    imageUrl?: string | null;
    ingredientLines?: string[];
    instructions?: string[];
  };
  if (!parsed.title || !Array.isArray(parsed.ingredientLines) || parsed.ingredientLines.length === 0) {
    return null;
  }
  return {
    title: parsed.title,
    sourceUrl: url,
    imageUrl: parsed.imageUrl ?? undefined,
    ingredientLines: parsed.ingredientLines.filter((s) => typeof s === 'string' && s.trim()),
    instructions: Array.isArray(parsed.instructions)
      ? parsed.instructions.filter((s) => typeof s === 'string' && s.trim())
      : [],
  };
}

async function parseOne(url: string): Promise<ParseResult> {
  let target: URL;
  try {
    target = new URL(url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    return { status: 'error', url, message: 'Not a valid http(s) URL.' };
  }

  let html: string;
  try {
    html = await fetchHtml(target.href);
  } catch (e) {
    const reason = e instanceof Error && e.name === 'AbortError' ? 'timed out' : 'could not be fetched';
    return { status: 'error', url, message: `The page ${reason}. Check the URL or add the recipe manually.` };
  }

  const scraped = extractRecipeFromHtml(html, target.href);
  if (scraped) return { status: 'success', url, data: scraped, via: 'scraper' };

  try {
    const ai = await aiFallback(target.href, html);
    if (ai) return { status: 'success', url, data: ai, via: 'ai' };
  } catch {
    // fall through to the generic error below
  }

  return {
    status: 'error',
    url,
    message: process.env.OPENAI_API_KEY
      ? 'No recipe could be extracted from this page. You can add it manually.'
      : 'No structured recipe data found on this page (AI fallback is not configured). You can add it manually.',
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 });
  }

  let body: { urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? body.urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
    : [];
  if (urls.length === 0) {
    return NextResponse.json({ error: 'Provide { urls: string[] } with at least one URL.' }, { status: 400 });
  }
  if (urls.length > MAX_URLS_PER_REQUEST) {
    return NextResponse.json({ error: `At most ${MAX_URLS_PER_REQUEST} URLs per request.` }, { status: 400 });
  }

  const results = await Promise.all(urls.map(parseOne));
  return NextResponse.json({ results });
}
