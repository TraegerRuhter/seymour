import type { Ingredient } from './types';
import { canonicalUnit, unitSystem } from './units';
import { normalizeIngredientName, QUALIFIERS } from './normalize';

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
 * Reads the stand-in a recipe used instead of an amount. The list itself lives
 * in normalize.ts, which also strips these off the name — one list, so the
 * name can't keep a phrase the amount column is already showing.
 */
// Longest first, so "for serving" wins over a bare "for". Sorted once: the
// list is static, and this runs on every line of every recipe.
const QUALIFIERS_BY_LENGTH = [...QUALIFIERS].sort((a, b) => b.length - a.length);

function matchQualifier(text: string): string | undefined {
  const lower = text.toLowerCase();
  return QUALIFIERS_BY_LENGTH.find((q) => lower.includes(q));
}

/**
 * A leading hedge means an amount nobody wrote down. Stripped so the name is
 * clean and the row buckets with the same ingredient written plainly, but the
 * quantity stays 0 — "some salt" genuinely doesn't say how much.
 */
const VAGUE_REGEX = /^(?:some|a few|few|a little|little|several)\s+/i;

/**
 * How a recipe joins an amount to its restatement in the other system:
 * "2 lb / 900 g beef", "250 g | 9 oz flour", "1 cup or 240 ml milk".
 * `or` needs the word boundary so it can't bite into "orange".
 */
const ECHO_SEPARATOR_REGEX = /^(?:[/|]|or\b)\s*/i;

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
 * Drops a restatement of the amount just read — item 5 of
 * docs/shopping-parser.md. "2 lb / 900 g beef" is one ingredient stated twice,
 * and without this the name comes out as "/ 900 g beef".
 *
 * The parenthetical form ("2 lb (900 g) beef") never had this problem: the
 * paren branch discards its contents outright. It's the slash and the "or"
 * that leak.
 *
 * The guard is the one the doc specifies — only discard when the second unit
 * is in a *different* measurement system to the first. That's what makes it a
 * conversion rather than a choice, so "2 cups milk or cream" and "1 lb chicken
 * or 2 lb beef" are both left alone for item 6 to deal with.
 */
function eatEcho(rest: string, unit: string): string {
  if (!unit || unitSystem(unit) === null) return rest;
  const separator = rest.match(ECHO_SEPARATOR_REGEX);
  if (!separator) return rest;

  const afterSeparator = rest.slice(separator[0].length).trim();
  const qty = matchLeadingQuantity(afterSeparator);
  if (!qty) return rest;

  const afterQuantity = afterSeparator.slice(qty.length).trim();
  const word = afterQuantity.match(ONE_WORD_UNIT_REGEX);
  const echoUnit = word && canonicalUnit(word[1]);
  if (!word || !echoUnit) return rest;
  if (unitSystem(echoUnit) === unitSystem(unit)) return rest;

  // Never eat the whole line: "2 lb / 900 g" with no name after it is better
  // left alone than reduced to nothing.
  const remainder = eatFiller(afterQuantity.slice(word[0].length).trim());
  return remainder || rest;
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
    rest = eatEcho(rest, unit);
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

/**
 * A line that is nothing but a joining word once it's parsed — a stray "of",
 * an "or" left on its own row by a scraper. As empty as a blank line, and it
 * would otherwise reach the shopping list as a row named "of".
 *
 * Whole name only. Anything with an ingredient attached is kept, however badly
 * it parsed, because dropping a line you needed to buy is the worse mistake.
 */
const JOINING_WORD_ONLY = /^(?:of|a|an|and|or|to|for|with|the)$/i;

/** Parses a list of raw ingredient lines, dropping the ones that name nothing. */
export function parseIngredientLines(lines: string[]): Ingredient[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredient)
    .filter((ing) => ing.name && !JOINING_WORD_ONLY.test(ing.name));
}
