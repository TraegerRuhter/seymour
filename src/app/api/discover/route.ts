import { NextRequest, NextResponse } from 'next/server';
import { searchRecipes } from '@/lib/spoonacular';
import { isRateLimited, requestIdentity } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 15;

const MAX_COUNT = 5;
const RATE_LIMIT = 8;

export async function POST(req: NextRequest) {
  if (await isRateLimited(`discover:${await requestIdentity(req)}`, RATE_LIMIT)) {
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
  if (!process.env.SPOONACULAR_API_KEY) {
    return NextResponse.json(
      {
        error:
          'Recipe discovery needs a Spoonacular API key configured on the server. Add recipes by URL or manually instead.',
      },
      { status: 400 },
    );
  }

  const requested = typeof body.count === 'number' ? Math.round(body.count) : 3;
  const count = Math.min(MAX_COUNT, Math.max(1, requested));

  let results;
  try {
    results = await searchRecipes(query, count);
  } catch {
    return NextResponse.json(
      { error: 'Recipe discovery failed. Try again in a moment.' },
      { status: 502 },
    );
  }

  if (results.length === 0) {
    return NextResponse.json(
      {
        error: `Couldn’t find recipes for “${query}”. Try a different search, or add one by URL.`,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ results, requested: count, found: results.length });
}
