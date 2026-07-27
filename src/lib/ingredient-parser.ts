import type { Ingredient } from './types';
import { canonicalUnit } from './units';
import { normalizeIngredientName } from './normalize';

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅐': 1 / 7,
  '⅑': 1 / 9,
  '⅒': 0.1,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
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
const PAREN_REGEX = /^\(([^)]*)\)\s*/;

/**
 * Words that carry no meaning once the quantity is out — "2 cups of flour",
 * "about 500 g beef".
 *
 * Applied after *every* consumption step rather than once. It used to run in a
 * single place, right after the unit, which meant the parenthetical branch
 * below could eat "(14 oz) cans" and expose a fresh "of" that nothing removed:
 * "2 (14 oz) cans of tomatoes" came out named "of tomato".
 */
const FILLER_REGEX = /^(?:of\s+the|of|about|approx\.?|approximately|around|roughly)\s+/i;
const eatFiller = (s: string) => s.replace(FILLER_REGEX, '').trim();

/**
 * A leading article means one of something: "a pinch of salt", "an onion".
 * Whole-word only, so it can't bite into a name.
 */
const ARTICLE_REGEX = /^(?:a|an)\s+/i;

/**
 * Phrases that stand in for an amount instead of stating one.
 *
 * `normalize.ts` strips these off the name, which is right — the row should
 * read "salt", not "salt to taste". But it strips them into nothing, so the
 * fact that the recipe *did* say how much was being lost, and the shopping
 * list showed an empty amount column that read as a parse failure. Caught
 * here first, and shown where the number would have been.
 *
 * Ordered longest-first so "for serving" wins over a bare "for".
 */
const QUALIFIERS = [
  'to taste',
  'as needed',
  'for serving',
  'for garnish',
  'for frying',
  'for dusting',
  'for greasing',
  'or to taste',
] as const;

function matchQualifier(text: string): string | undefined {
  const lower = text.toLowerCase();
  const found = [...QUALIFIERS].sort((a, b) => b.length - a.length).find((q) => lower.includes(q));
  // "or to taste" is "to taste" with a shrug in front of it.
  return found === 'or to taste' ? 'to taste' : found;
}

/**
 * A leading hedge means an amount nobody wrote down. Stripped so the name is
 * clean and the row buckets with the same ingredient written plainly, but the
 * quantity stays 0 — "some salt" genuinely doesn't say how much.
 */
const VAGUE_REGEX = /^(?:some|a few|few|a little|little|several)\s+/i;

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

  // "about 2 cups flour" — an approximator before the number would otherwise
  // stop the quantity match dead and leave the whole line as the name.
  rest = eatFiller(rest);

  const qty = matchLeadingQuantity(rest);
  // Hedges before articles: "a few" opens with an "a", and testing for the
  // article first claimed it, leaving "few sprigs of thyme" as the name.
  let vague = false;
  if (qty) {
    quantity = qty.value;
    rest = rest.slice(qty.length).trim();
  } else if (VAGUE_REGEX.test(rest)) {
    vague = true;
    rest = rest.replace(VAGUE_REGEX, '').trim();
  } else if (ARTICLE_REGEX.test(rest)) {
    quantity = 1;
    rest = rest.replace(ARTICLE_REGEX, '').trim();
  }

  // A unit with no number in front of it means one of them: "Pinch of salt",
  // "Handful of parsley", "Can of tomatoes". Everything below used to sit
  // behind `quantity > 0`, so these lines kept every word and formed their own
  // shopping row rather than joining the one for plain salt.
  if (quantity === 0) {
    const bare = rest.match(ONE_WORD_UNIT_REGEX);
    const bareUnit = bare && canonicalUnit(bare[1]);
    // Only when something is left to name — "Pinch" on its own is not an
    // ingredient, and consuming it would leave nothing behind.
    if (bare && bareUnit && rest.slice(bare[0].length).trim()) {
      rest = eatFiller(rest.slice(bare[0].length).trim());
      // After a hedge the unit is swallowed to clean the name but not
      // recorded: "a few sprigs of thyme" is not one sprig, and claiming a
      // number nobody wrote is worse than showing none.
      if (!vague) {
        quantity = 1;
        unit = bareUnit;
      }
    }
  }

  if (quantity > 0) {
    // Optional unit token right after the quantity. Try two-word units first ("fl oz", "fluid ounces").
    const twoWord = rest.match(TWO_WORD_UNIT_REGEX);
    const twoWordUnit = twoWord && canonicalUnit(twoWord[1].replace(/\./g, ''));
    if (twoWord && twoWordUnit) {
      unit = twoWordUnit;
      rest = rest.slice(twoWord[0].length).trim();
    } else {
      const oneWord = rest.match(ONE_WORD_UNIT_REGEX);
      const oneWordUnit = oneWord && canonicalUnit(oneWord[1]);
      if (oneWord && oneWordUnit) {
        unit = oneWordUnit;
        rest = rest.slice(oneWord[0].length).trim();
      }
    }
    // Skip filler like "of" — "2 cups of flour"
    rest = eatFiller(rest);
    // Parenthetical right after quantity/unit, e.g. "1 (15 oz) can black beans"
    const paren = rest.match(PAREN_REGEX);
    if (paren) {
      rest = eatFiller(rest.slice(paren[0].length));
      const innerUnit = rest.match(ONE_WORD_UNIT_REGEX);
      const innerCanonical = innerUnit && canonicalUnit(innerUnit[1]);
      if (!unit && innerUnit && innerCanonical) {
        unit = innerCanonical;
        // The one that was missing. "2 (14 oz) cans of tomatoes" reaches here
        // with "of tomatoes" left, and the strip above already ran.
        rest = eatFiller(rest.slice(innerUnit[0].length).trim());
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

  // Countable unit word *after* the name ("2 garlic cloves") rather than
  // before it ("2 cloves garlic") — without this, the unit word gets
  // swallowed into the name and the two phrasings bucket differently at
  // aggregation time even though they mean the same thing.
  if (!unit) {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const trailingUnit = canonicalUnit(words[words.length - 1]);
      if (trailingUnit) {
        unit = trailingUnit;
        name = words.slice(0, -1).join(' ');
      }
    }
  }

  name = normalizeIngredientName(name);

  // A bare garlic count ("2 garlic") conventionally means cloves — nobody
  // writing an ingredient list means a whole head — so default the unit to
  // keep every garlic phrasing ("1 garlic", "2 garlic cloves", "3 cloves
  // garlic") bucketing together instead of splitting the shopping list.
  if (name === 'garlic' && !unit && quantity > 0) unit = 'clove';

  // Read off the whole original line: "to taste" can trail the name or the
  // notes ("salt, or to taste"), and by this point both have been trimmed.
  const qualifier = quantity === 0 ? matchQualifier(text) : undefined;

  return {
    name: name || normalizeIngredientName(text),
    quantity,
    unit,
    originalString,
    ...(notes ? { notes } : {}),
    ...(qualifier ? { qualifier } : {}),
  };
}

/** Parses a list of raw ingredient lines, dropping blanks. */
export function parseIngredientLines(lines: string[]): Ingredient[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredient);
}
