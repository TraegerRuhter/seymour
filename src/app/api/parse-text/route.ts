import { NextRequest, NextResponse } from 'next/server';
import { extractRecipeViaAI } from '@/lib/ai-extract';
import { extractRecipeFromText } from '@/lib/text-extract';
import { isRateLimited, requestIdentity } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_TEXT_LENGTH = 50_000;
const RATE_LIMIT = 30;

export async function POST(req: NextRequest) {
  if (await isRateLimited(`parse-text:${await requestIdentity(req)}`, RATE_LIMIT)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ status: 'error', message: 'Paste some recipe text first.' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({
      status: 'error',
      message: `That's a lot of text — trim it down to the recipe itself (under ${MAX_TEXT_LENGTH.toLocaleString()} characters).`,
    });
  }

  // Prefer the AI path when available — it copes far better with the nav/ad/
  // comment clutter that comes along with a raw page paste. Fall back to the
  // dependency-free heading-based heuristic otherwise (or if the AI call fails).
  let data = null;
  let via: 'ai' | 'heuristic' = 'heuristic';
  try {
    data = await extractRecipeViaAI({ text });
    if (data) via = 'ai';
  } catch {
    // fall through to the heuristic below
  }

  if (!data) {
    data = extractRecipeFromText(text);
  }

  if (!data) {
    return NextResponse.json({
      status: 'error',
      message:
        'Couldn’t find an ingredients or instructions section in that text. Double-check what you copied, or fill in the fields by hand below.',
    });
  }

  return NextResponse.json({ status: 'success', data, via });
}
