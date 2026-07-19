import { NextRequest, NextResponse } from 'next/server';
import { parseOne } from '@/lib/parse-url';
import { isRateLimited, requestIdentity } from '@/lib/rate-limit';

export const runtime = 'nodejs';
// Reader-proxy rendering can take 10–20s; raise the function budget above
// Vercel's 10s default so those requests don't 504. (Multiple URLs are parsed
// in parallel, so this bounds the slowest single URL, not their sum.)
export const maxDuration = 60;

const MAX_URLS_PER_REQUEST = 10;
const RATE_LIMIT = 30;

export async function POST(req: NextRequest) {
  if (isRateLimited(`parse:${await requestIdentity(req)}`, RATE_LIMIT)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: { urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const urls = Array.isArray(body.urls)
    ? body.urls
        .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        .map((u) => u.trim())
    : [];
  if (urls.length === 0) {
    return NextResponse.json(
      { error: 'Provide { urls: string[] } with at least one URL.' },
      { status: 400 },
    );
  }
  if (urls.length > MAX_URLS_PER_REQUEST) {
    return NextResponse.json(
      { error: `At most ${MAX_URLS_PER_REQUEST} URLs per request.` },
      { status: 400 },
    );
  }

  const results = await Promise.all(urls.map(parseOne));
  return NextResponse.json({ results });
}
