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
const SKIP_LINE =
  /^(jump\s+to\s+recipe|print(\s+recipe)?|save(\s+recipe)?|pin(\s+it)?|share|rate\s+this\s+recipe|★+|prep\s*time|cook\s*time|total\s*time|servings?|yield|by\s+\S+|posted\s+(on|by))\b/i;
const STEP_NUMBER_PREFIX = /^\s*(?:step\s*)?\d+[.):]\s*/i;
const NAV_WORDS = new Set([
  'menu', 'home', 'about', 'contact', 'recipes', 'blog', 'shop', 'search',
  'subscribe', 'login', 'sign in', 'cart', 'newsletter', 'skip to content',
  'skip to recipe',
]);

const MAX_HEADING_LINE_LENGTH = 60;
const MIN_TITLE_LENGTH = 4;
const MAX_TITLE_LENGTH = 100;

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

/** Picks the most title-like line before the first section heading. */
function guessTitle(lines: string[], before: number): string {
  const end = before === -1 ? Math.min(lines.length, 15) : before;
  for (let i = 0; i < end; i++) {
    const line = lines[i];
    if (line.length < MIN_TITLE_LENGTH || line.length > MAX_TITLE_LENGTH) continue;
    if (!/[a-zA-Z]/.test(line)) continue;
    if (SKIP_LINE.test(line)) continue;
    if (NAV_WORDS.has(line.toLowerCase())) continue;
    return line;
  }
  return '';
}

export function extractRecipeFromText(raw: string): ParsedRecipeData | null {
  const lines = normalize(raw);
  if (lines.length === 0) return null;

  const ingIdx = findHeading(lines, INGREDIENTS_HEADING, 0);
  const instIdx = findHeading(lines, INSTRUCTIONS_HEADING, ingIdx === -1 ? 0 : ingIdx + 1);
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
