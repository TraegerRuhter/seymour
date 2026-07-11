import type { ParsedRecipeData } from './types';

/**
 * Dependency-free, best-effort recipe extraction from raw pasted page text —
 * the fallback used when no AI key is configured (or the AI call fails).
 * Looks for "Ingredients" / "Instructions"-style section headings, common on
 * recipe pages, and slices the lines between them. This is inherently
 * heuristic: it can't understand the page semantically the way the AI path
 * can, so results are meant to be reviewed/edited before saving, not trusted
 * blindly.
 */

const INGREDIENTS_HEADING = /^ingredients\b/i;
const INSTRUCTIONS_HEADING = /^(instructions?|directions?|method|preparation|steps)\b/i;
const STOP_HEADING =
  /^(notes?|nutrition|nutritional\s+information|comments?|reviews?|related\s+recipes?|you\s+might\s+also\s+like|tags?|share\s+this|leave\s+a\s+(reply|comment)|more\s+recipes?)\b/i;
// ★ is a non-word character, so a trailing \b after a run of stars can never
// match (there's no word/non-word transition between two stars, or between a
// star and the space that follows) — it needs its own unanchored-at-the-end
// alternative rather than sharing the \b that the word-based phrases use.
const SKIP_LINE =
  /^(jump\s+to\s+recipe|print(\s+recipe)?|save(\s+recipe)?|pin(\s+it)?|share|rate\s+this\s+recipe|prep\s*time|cook\s*time|total\s*time|servings?|yield|by\s+\S+|posted\s+(on|by))\b|^★+/i;
const STEP_NUMBER_PREFIX = /^\s*(?:step\s*)?\d+[.):]\s*/i;
const NAV_WORDS = new Set([
  'menu', 'home', 'about', 'contact', 'recipes', 'blog', 'shop', 'search',
  'subscribe', 'login', 'sign in', 'cart', 'newsletter', 'skip to content',
  'skip to recipe', 'occasions', 'cuisines', 'in the kitchen', 'news',
  'community', 'video', 'about us', 'ingredients', 'meal types', 'holidays',
  'world cuisine', 'kitchen tips',
]);
// Short all-caps banner/promo lines ("GET THE MAGAZINE", "SUBSCRIBE NOW") —
// real recipe titles are essentially never pasted in all caps, since the
// page displays them in normal case and copy/paste preserves that.
const ALL_CAPS_LINE = /^[A-Z0-9][A-Z0-9 &'!,.:-]*$/;
// A long line ending in terminal punctuation reads as a sentence (an intro
// paragraph, a blurb) rather than a title — recipe titles are noun phrases
// and essentially never end with a period when copy-pasted from an <h1>.
function looksLikeSentence(line: string): boolean {
  return line.length > 40 && /[.!?]$/.test(line);
}

// Content-shape checks used to validate a heading match, so a site-nav link
// that's literally labeled "Ingredients" (common — "browse by ingredient" is
// a real nav feature on big recipe sites) doesn't hijack the real section.
const INGREDIENT_LEADING_RE = /^(\d|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|[-•*▪])/;
const UNIT_WORD_RE =
  /\b(cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|grams?|kg|kilograms?|ml|milliliters?|liters?|cloves?|pinch(es)?|slices?|cans?|packages?|sticks?|bunch(es)?|dash(es)?|handfuls?)\b/i;
const MIN_INSTRUCTION_LENGTH = 20;

const MAX_HEADING_LINE_LENGTH = 60;
const MIN_TITLE_LENGTH = 4;
const MAX_TITLE_LENGTH = 100;
/** Only lines this close to a validated heading are considered for the title. */
const TITLE_LOOKBACK = 12;

function normalize(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function isHeading(line: string, re: RegExp): boolean {
  return line.length <= MAX_HEADING_LINE_LENGTH && re.test(line);
}

function findHeading(lines: string[], re: RegExp, from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (isHeading(lines[i], re)) return i;
  }
  return -1;
}

function looksLikeIngredient(line: string): boolean {
  return line.length <= 150 && (INGREDIENT_LEADING_RE.test(line) || UNIT_WORD_RE.test(line));
}

function looksLikeInstruction(line: string): boolean {
  return line.length >= MIN_INSTRUCTION_LENGTH;
}

/**
 * Finds a heading match whose next couple of lines actually look like that
 * section's content — guarding against false positives like a site-nav link
 * literally labeled "Ingredients". Falls back to the last raw candidate
 * (typically closer to the real content than the first, since nav/header
 * clutter sits at the top of most pasted pages) when nothing validates.
 */
function findValidatedHeading(
  lines: string[],
  headingRe: RegExp,
  from: number,
  contentLooksRight: (line: string) => boolean,
): number {
  let lastCandidate = -1;
  for (let i = from; i < lines.length; i++) {
    if (!isHeading(lines[i], headingRe)) continue;
    lastCandidate = i;
    const next = lines.slice(i + 1, i + 4).filter((l) => !SKIP_LINE.test(l));
    if (next.some(contentLooksRight)) return i;
  }
  return lastCandidate;
}

/** Picks the most title-like line in a small window right before the heading. */
function guessTitle(lines: string[], before: number): string {
  const end = before === -1 ? Math.min(lines.length, 15) : before;
  const start = before === -1 ? 0 : Math.max(0, before - TITLE_LOOKBACK);
  let best = '';
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (line.length < MIN_TITLE_LENGTH || line.length > MAX_TITLE_LENGTH) continue;
    if (!/[a-zA-Z]/.test(line)) continue;
    if (SKIP_LINE.test(line)) continue;
    if (NAV_WORDS.has(line.toLowerCase())) continue;
    if (line.length < 40 && ALL_CAPS_LINE.test(line)) continue;
    if (looksLikeSentence(line)) continue;
    best = line; // keep the one closest to the heading
  }
  return best;
}

export function extractRecipeFromText(raw: string): ParsedRecipeData | null {
  const lines = normalize(raw);
  if (lines.length === 0) return null;

  const ingIdx = findValidatedHeading(lines, INGREDIENTS_HEADING, 0, looksLikeIngredient);
  const instIdx = findValidatedHeading(
    lines,
    INSTRUCTIONS_HEADING,
    ingIdx === -1 ? 0 : ingIdx + 1,
    looksLikeInstruction,
  );
  if (ingIdx === -1 && instIdx === -1) return null;

  const stopIdx = findHeading(lines, STOP_HEADING, (instIdx !== -1 ? instIdx : ingIdx) + 1);

  const ingredientLines =
    ingIdx === -1
      ? []
      : lines
          .slice(ingIdx + 1, instIdx !== -1 ? instIdx : stopIdx !== -1 ? stopIdx : lines.length)
          .filter((l) => !SKIP_LINE.test(l));

  const instructions =
    instIdx === -1
      ? []
      : lines
          .slice(instIdx + 1, stopIdx !== -1 ? stopIdx : lines.length)
          .filter((l) => !SKIP_LINE.test(l))
          .map((l) => l.replace(STEP_NUMBER_PREFIX, '').trim())
          .filter(Boolean);

  if (ingredientLines.length === 0 && instructions.length === 0) return null;

  return {
    title: guessTitle(lines, ingIdx !== -1 ? ingIdx : instIdx) || 'Untitled recipe',
    sourceUrl: '',
    imageUrl: undefined,
    ingredientLines,
    instructions,
  };
}
