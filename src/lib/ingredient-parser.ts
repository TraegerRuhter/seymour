import type { Ingredient } from './types';
import { canonicalUnit } from './units';
import { normalizeIngredientName } from './normalize';

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75,
  '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1,
  '⅓': 1 / 3, '⅔': 2 / 3,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

/** Matches a number: unicode fraction, ascii fraction, decimal, or integer. */
const NUMBER_RE = /(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d*\.\d+|\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/;

// Precompile regexes for better performance
const MIXED_NUMBER_REGEX = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/;
const FRACTION_REGEX = /^(\d+)\s*\/\s*(\d+)$/;
const GLUED_FRACTION_REGEX = /^(\d+)([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/;
const RANGE_SEPARATOR_REGEX = /^\s*(?:-|–|—|to)\s*/;
const LEADING_NUMBER_REGEX = new RegExp(`^${NUMBER_RE.source}`);
const LEADING_RANGE_REGEX = new RegExp(`${RANGE_SEPARATOR_REGEX.source}${NUMBER_RE.source}`);
const TWO_WORD_UNIT_REGEX = /^([a-zA-Z]+\.?\s+[a-zA-Z]+\.?)\s+/;
const ONE_WORD_UNIT_REGEX = /^([a-zA-Z]+\.?)(\s+|$)/;
const OF_FILLER_REGEX = /^of\s+/i;
const PAREN_REGEX = /^\(([^)]*)\)\s*/;

function parseNumberToken(token: string): number {
  token = token.trim();
  if (token in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[token];
  // mixed number "1 1/2"
  const mixed = token.match(MIXED_NUMBER_REGEX);
  if (mixed) return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
  const frac = token.match(FRACTION_REGEX);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  return parseFloat(token);
}

interface QuantityMatch {
  /** Averaged value when the quantity is a range like "1-2". */
  value: number;
  /** Length of the matched quantity prefix in the input string. */
  length: number;
}

/**
 * Reads a leading quantity off an ingredient string. Handles:
 *   "2", "2.5", "1/2", "1 1/2", "1½", "½", "1-2", "1 – 2", "1 to 2"
 * Ranges are averaged for summation (the original string is preserved
 * elsewhere for display).
 */
function matchLeadingQuantity(text: string): QuantityMatch | null {
  // integer immediately followed by a unicode fraction: "1½"
  const glued = text.match(GLUED_FRACTION_REGEX);
  let first: number;
  let consumed: number;
  if (glued) {
    first = parseInt(glued[1], 10) + UNICODE_FRACTIONS[glued[2]];
    consumed = glued[0].length;
  } else {
    const m = text.match(LEADING_NUMBER_REGEX);
    if (!m) return null;
    first = parseNumberToken(m[0]);
    consumed = m[0].length;
  }

  // range: "- 2", "– 2", "to 2"
  const rest = text.slice(consumed);
  const rangeMatch = rest.match(LEADING_RANGE_REGEX);
  if (rangeMatch) {
    const second = parseNumberToken(rangeMatch[1]);
    if (!Number.isNaN(second) && second >= first) {
      return { value: (first + second) / 2, length: consumed + rangeMatch[0].length };
    }
  }
  return { value: first, length: consumed };
}

/**
 * Parses a single ingredient line into structured fields.
 * The original string is always preserved verbatim.
 */
export function parseIngredient(originalString: string): Ingredient {
  const text = originalString.trim();
  let rest = text;
  let quantity = 0;
  let unit = '';

  const qty = matchLeadingQuantity(rest);
  if (qty) {
    quantity = qty.value;
    rest = rest.slice(qty.length).trim();
  }

  if (quantity > 0) {
    // Optional unit token right after the quantity. Try two-word units first ("fl oz", "fluid ounces").
    const twoWord = rest.match(TWO_WORD_UNIT_REGEX);
    if (twoWord && canonicalUnit(twoWord[1].replace(/\./g, ''))) {
      unit = canonicalUnit(twoWord[1].replace(/\./g, ''))!;
      rest = rest.slice(twoWord[0].length).trim();
    } else {
      const oneWord = rest.match(ONE_WORD_UNIT_REGEX);
      if (oneWord && canonicalUnit(oneWord[1])) {
        unit = canonicalUnit(oneWord[1])!;
        rest = rest.slice(oneWord[0].length).trim();
      }
    }
    // Skip filler like "of" — "2 cups of flour"
    rest = rest.replace(OF_FILLER_REGEX, '');
    // Parenthetical right after quantity/unit, e.g. "1 (15 oz) can black beans"
    const paren = rest.match(PAREN_REGEX);
    if (paren) {
      rest = rest.slice(paren[0].length);
      const innerUnit = rest.match(ONE_WORD_UNIT_REGEX);
      if (!unit && innerUnit && canonicalUnit(innerUnit[1])) {
        unit = canonicalUnit(innerUnit[1])!;
        rest = rest.slice(innerUnit[0].length).trim();
      }
    }
  }

  // Split trailing notes after the first comma: "onion, finely diced"
  let name = rest;
  let notes: string | undefined;
  const comma = rest.indexOf(',');
  if (comma !== -1) {
    name = rest.slice(0, comma).trim();
    notes = rest.slice(comma + 1).trim() || undefined;
  }

  name = normalizeIngredientName(name);

  return {
    name: name || normalizeIngredientName(text),
    quantity,
    unit,
    originalString,
    ...(notes ? { notes } : {}),
  };
}

/** Parses a list of raw ingredient lines, dropping blanks. */
export function parseIngredientLines(lines: string[]): Ingredient[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredient);
}
