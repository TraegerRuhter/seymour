import { NextRequest, NextResponse } from 'next/server';
import type { ParsedRecipeData } from '@/lib/types';
import { parseOne } from '@/lib/parse-url';
import { suggestRecipeUrls } from '@/lib/ai-discover';
import { isRateLimited, requestIdentity } from '@/lib/rate-limit';

export const runtime = 'nodejs';
// Same reasoning as /api/parse: the reader-proxy fallback can take 10-25s
// per URL, and this route fetches several candidates.
export const maxDuration = 60;

const MAX_COUNT = 5;
// Stricter than /api/parse's URL-paste limit — each request here costs an
// LLM call plus up to 2x candidateCount page fetches, so it's a heavier
// endpoint to abuse.
const RATE_LIMIT = 8;

export async function POST(req: NextRequest) {
  if (isRateLimited(`discover:${await requestIdentity(req)}`, RATE_LIMIT)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: { query?: unknown; count?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) {
    return NextResponse.json(
      { error: 'Describe what you’re looking for, e.g. "chicken" or "quick vegetarian dinners".' },
      { status: 400 },
    );
  }
  if (query.length > 200) {
    return NextResponse.json({ error: 'Keep the search under 200 characters.' }, { status: 400 });
  }

  // Bad client input is worth reporting accurately even when the server
  // isn't configured for discovery — check the request shape before falling
  // back to the "no API key" message, not after.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          'Recipe discovery needs an OpenAI API key configured on the server. Add recipes by URL or manually instead.',
      },
      { status: 400 },
    );
  }

  const requested = typeof body.count === 'number' ? Math.round(body.count) : 3;
  const count = Math.min(MAX_COUNT, Math.max(1, requested));
  // Ask for more candidates than needed — some will fail to fetch or won't
  // turn out to be a real recipe page once fetched.
  const candidateCount = Math.min(count * 3, 10);

  let candidates;
  try {
    candidates = await suggestRecipeUrls(query, candidateCount);
  } catch {
    return NextResponse.json(
      { error: 'Recipe discovery failed. Try again in a moment.' },
      { status: 502 },
    );
  }
  if (candidates.length === 0) {
    return NextResponse.json(
      {
        error: `Couldn’t come up with suggestions for “${query}”. Try a different search, or add a recipe by URL.`,
      },
      { status: 404 },
    );
  }

  // Fetch every candidate in parallel (bounded by candidateCount, same
  // pattern as /api/parse), then keep the first `count` successes in the
  // model's suggested order. A candidate only becomes a result if it
  // actually passes the same JSON-LD/microdata/AI-extraction pipeline a
  // pasted URL does — a hallucinated or dead link just yields nothing.
  const settled = await Promise.all(candidates.map((c) => parseOne(c.url)));
  const results: ParsedRecipeData[] = [];
  for (const r of settled) {
    if (results.length >= count) break;
    if (r.status === 'success') results.push(r.data);
  }

  if (results.length === 0) {
    return NextResponse.json(
      {
        error: `Found some candidates for “${query}” but couldn’t read any of them. Try again, or add one by URL.`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ results, requested: count, found: results.length });
}
