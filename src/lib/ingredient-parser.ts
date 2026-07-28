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

/**
 * "butter or margarine" is a single shopping row for a product that doesn't
 * exist — item 6. The first option becomes the name; the rest is kept as a
 * note rather than thrown away.
 *
 * Whitespace on both sides is what makes this safe: "orange", "oregano",
 * "chorizo" and "cornmeal" all contain the letters but never the word.
 */
const ALTERNATIVE_REGEX = /\s+or\s+/i;

/**
 * The parenthesised form, "cilantro (or parsley)". Caught before
 * normalizeIngredientName, which drops parentheticals wholesale and would
 * take the alternative with them.
 */
const PAREN_ALTERNATIVE_REGEX = /\s*\(\s*or\s+([^)]*)\)/i;

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
 * What a line has been read down to so far.
 *
 * `rest` is what's left to read. The first half of the pipeline eats from the
 * front of it; once `splitNotes` runs, what remains is the name and `rest` is
 * no longer touched.
 */
interface Reading {
  /** The line as given, trimmed. Some stages need the whole thing. */
  text: string;
  /** The unread remainder. */
  rest: string;
  quantity: number;
  unit: string;
  /**
   * A hedge was consumed ("a few", "some"). A unit found afterwards is
   * swallowed to clean the name but not recorded as a count.
   */
  vague: boolean;
  name: string;
  notes?: string;
  qualifier?: string;
}

type Stage = (r: Reading) => Reading;

/**
 * "about 2 cups flour" — an approximator in front of the number would
 * otherwise stop the quantity match dead and leave the whole line as the name.
 */
const readLeadingFiller: Stage = (r) => ({ ...r, rest: eatFiller(r.rest) });

/**
 * The number, or one of the two things that stand in for one.
 *
 * Hedges are tested before articles: "a few" opens with an "a", and testing
 * the article first claimed it, leaving "few sprigs of thyme" as the name.
 */
const readQuantity: Stage = (r) => {
  const qty = matchLeadingQuantity(r.rest);
  if (qty) return { ...r, quantity: qty.value, rest: r.rest.slice(qty.length).trim() };
  if (VAGUE_REGEX.test(r.rest)) {
    return { ...r, vague: true, rest: r.rest.replace(VAGUE_REGEX, '').trim() };
  }
  if (ARTICLE_REGEX.test(r.rest)) {
    return { ...r, quantity: 1, rest: r.rest.replace(ARTICLE_REGEX, '').trim() };
  }
  return r;
};

/**
 * A unit with no number in front of it means one of them: "Pinch of salt",
 * "Handful of parsley", "Can of tomatoes". This whole pass used to sit behind
 * `quantity > 0`, so these lines kept every word and formed their own shopping
 * row rather than joining the one for plain salt.
 */
const readBareUnit: Stage = (r) => {
  if (r.quantity !== 0) return r;
  const bare = r.rest.match(ONE_WORD_UNIT_REGEX);
  const bareUnit = bare && canonicalUnit(bare[1]);
  // Only when something is left to name — "Pinch" on its own is not an
  // ingredient, and consuming it would leave nothing behind.
  if (!bare || !bareUnit || !r.rest.slice(bare[0].length).trim()) return r;

  const rest = eatFiller(r.rest.slice(bare[0].length).trim());
  // After a hedge the unit is swallowed but not recorded: "a few sprigs of
  // thyme" is not one sprig, and claiming a number nobody wrote is worse than
  // showing none.
  return r.vague ? { ...r, rest } : { ...r, rest, quantity: 1, unit: bareUnit };
};

/** The unit token right after the quantity. Two-word units first ("fl oz"). */
const readUnit: Stage = (r) => {
  if (r.quantity <= 0) return r;
  const twoWord = r.rest.match(TWO_WORD_UNIT_REGEX);
  const twoWordUnit = twoWord && canonicalUnit(twoWord[1].replace(/\./g, ''));
  if (twoWord && twoWordUnit) {
    return { ...r, unit: twoWordUnit, rest: eatFiller(r.rest.slice(twoWord[0].length).trim()) };
  }
  const oneWord = r.rest.match(ONE_WORD_UNIT_REGEX);
  const oneWordUnit = oneWord && canonicalUnit(oneWord[1]);
  if (oneWord && oneWordUnit) {
    return { ...r, unit: oneWordUnit, rest: eatFiller(r.rest.slice(oneWord[0].length).trim()) };
  }
  // Still worth a filler strip — "2 of the onions".
  return { ...r, rest: eatFiller(r.rest) };
};

/** A size in brackets: "1 (15 oz) can black beans". */
const readParenthetical: Stage = (r) => {
  if (r.quantity <= 0) return r;
  const paren = r.rest.match(PAREN_REGEX);
  if (!paren) return r;

  const rest = eatFiller(r.rest.slice(paren[0].length));
  const innerUnit = rest.match(ONE_WORD_UNIT_REGEX);
  const innerCanonical = innerUnit && canonicalUnit(innerUnit[1]);
  if (r.unit || !innerUnit || !innerCanonical) return { ...r, rest };
  // The filler strip that was missing: "2 (14 oz) cans of tomatoes" arrives
  // here with "of tomatoes" left, and the strip above has already run.
  return {
    ...r,
    unit: innerCanonical,
    rest: eatFiller(rest.slice(innerUnit[0].length).trim()),
  };
};

/** The same amount restated in the other system — see `eatEcho`. */
const readEcho: Stage = (r) => (r.quantity > 0 ? { ...r, rest: eatEcho(r.rest, r.unit) } : r);

/** Trailing preparation after the first comma: "onion, finely diced". */
const splitNotes: Stage = (r) => {
  const comma = r.rest.indexOf(',');
  if (comma === -1) return { ...r, name: r.rest };
  return {
    ...r,
    name: r.rest.slice(0, comma).trim(),
    notes: r.rest.slice(comma + 1).trim() || undefined,
  };
};

/**
 * An alternative the recipe offered. The first option is what goes on the list
 * — you buy one of them, not a hybrid — and the rest becomes a note so the
 * choice survives. The full line is shown verbatim on the recipe, in cook mode
 * and in the shopping list's breakdown, so nothing is hidden.
 */
const readAlternative: Stage = (r) => {
  let name = r.name;
  let alternative: string | undefined;

  const parenAlternative = name.match(PAREN_ALTERNATIVE_REGEX);
  if (parenAlternative) {
    alternative = parenAlternative[1].trim();
    name = name.replace(PAREN_ALTERNATIVE_REGEX, '').trim();
  }
  const options = name.split(ALTERNATIVE_REGEX);
  if (options.length > 1 && options[0].trim()) {
    name = options[0].trim();
    alternative ??= options.slice(1).join(' or ').trim();
  }
  if (!alternative) return { ...r, name };

  return { ...r, name, notes: r.notes ? `or ${alternative}; ${r.notes}` : `or ${alternative}` };
};

/**
 * A countable unit word *after* the name ("2 garlic cloves") rather than
 * before it ("2 cloves garlic"). Without this the unit word is swallowed into
 * the name and the two phrasings bucket apart at aggregation time even though
 * they mean the same thing.
 */
const readTrailingUnit: Stage = (r) => {
  if (r.unit) return r;
  const words = r.name.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return r;
  const trailingUnit = canonicalUnit(words[words.length - 1]);
  if (!trailingUnit) return r;
  return { ...r, unit: trailingUnit, name: words.slice(0, -1).join(' ') };
};

const normalizeName: Stage = (r) => {
  const name = normalizeIngredientName(r.name);
  // A bare garlic count ("2 garlic") conventionally means cloves — nobody
  // writing an ingredient list means a whole head — so default the unit to
  // keep every garlic phrasing bucketing together instead of splitting the list.
  const unit = name === 'garlic' && !r.unit && r.quantity > 0 ? 'clove' : r.unit;
  return { ...r, name, unit };
};

/**
 * What the recipe said instead of an amount. Read off the whole original line:
 * "to taste" can trail the name or the notes ("salt, or to taste"), and by
 * this point both have been trimmed away.
 */
const readQualifier: Stage = (r) =>
  r.quantity === 0 ? { ...r, qualifier: matchQualifier(r.text) } : r;

/**
 * The order is the whole algorithm, so it's written as one list rather than
 * buried in control flow. Each stage consumes what it recognizes and passes
 * the rest along; a stage that doesn't apply returns its input untouched.
 *
 * Stages up to `readEcho` eat from the front of `rest`. `splitNotes` turns
 * what's left into the name, and everything after it works on that.
 */
const STAGES: Stage[] = [
  readLeadingFiller,
  readQuantity,
  readBareUnit,
  readUnit,
  readParenthetical,
  readEcho,
  splitNotes,
  readAlternative,
  readTrailingUnit,
  normalizeName,
  readQualifier,
];

/**
 * Parses a single ingredient line into structured fields.
 * The original string is always preserved verbatim.
 */
export function parseIngredient(originalString: string): Ingredient {
  const text = originalString.trim();
  const read = STAGES.reduce<Reading>((r, stage) => stage(r), {
    text,
    rest: text,
    quantity: 0,
    unit: '',
    vague: false,
    name: '',
  });

  return {
    name: read.name || normalizeIngredientName(text),
    quantity: read.quantity,
    unit: read.unit,
    originalString,
    ...(read.notes ? { notes: read.notes } : {}),
    ...(read.qualifier ? { qualifier: read.qualifier } : {}),
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
