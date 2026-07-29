import type { Ingredient } from './types';
import { applyCorrection, EMPTY_INDEX, type CorrectionIndex } from './corrections';
import { canonicalUnit, toBase, unitSystem } from './units';
import {
  isKnownFoodPhrase,
  MODIFIER_WORDS,
  normalizeIngredientName,
  QUALIFIERS,
} from './normalize';

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
// "or" belongs here as much as "to" does: "3 or 4 stalks lemon grass" is a
// range, and without it the "or" survived into the name. A digit has to follow,
// so "1 orange" is untouched.
const RANGE_SEPARATOR_REGEX = /^\s*(?:-|–|—|to|or)\s*/;
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
const FILLER_REGEX =
  /^(?:of\s+the|of|about|approx\.?|approximately|around|roughly|scant|generous|heaping|heaped|rounded)\s+/i;
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
 * A line that is nothing but a joining word once it's parsed — a stray "of",
 * an "or" left on its own row by a scraper. As empty as a blank line, and it
 * would otherwise reach the shopping list as a row named "of".
 *
 * Whole name only. Anything with an ingredient attached is kept, however badly
 * it parsed, because dropping a line you needed to buy is the worse mistake.
 */
const JOINING_WORD_ONLY = /^(?:of|a|an|and|or|to|for|with|the)$/i;

/**
 * A name that is only the amount echoed back: "1 teaspoon", "3 tbsp", "2".
 *
 * parseIngredient never returns an empty name — it falls back to the whole
 * line rather than a blank row — so a line with nothing but a measurement in
 * it comes out named after its own measurement. There is no ingredient here to
 * shop for, which makes it as empty as a blank line.
 */
const AMOUNT_ONLY = /^[\d\s./¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞-]+([a-z.]*)$/i;

function namesNothing(name: string): boolean {
  if (JOINING_WORD_ONLY.test(name)) return true;
  const amount = name.match(AMOUNT_ONLY);
  return !!amount && (!amount[1] || canonicalUnit(amount[1]) !== null);
}

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

/**
 * Numbers a recipe spells out. "one onion", "half a lemon" — uncommon in the
 * middle of a list and normal at the start of one.
 */
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
  quarter: 0.25,
};

const NUMBER_WORD_REGEX = new RegExp(
  `^(${Object.keys(NUMBER_WORDS)
    .filter((w) => w !== 'a' && w !== 'an')
    .join('|')})\\b\\s*`,
  'i',
);

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
  const spelled = text.match(NUMBER_WORD_REGEX);
  if (spelled) {
    // "half a lemon" — the article after a spelled number is part of the
    // phrase, not a second count.
    const after = text.slice(spelled[0].length).replace(ARTICLE_REGEX, '');
    return {
      value: NUMBER_WORDS[spelled[1].toLowerCase()],
      length: text.length - after.length,
    };
  }

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
  /** The part of the ingredient a line asked for — "juice", "zest". */
  derivative?: string;
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

/**
 * Lengths, which a recipe uses to size a thing but nobody buys by. Not in
 * units.ts because the shopping list can never sum them.
 */
const LENGTH_WORDS = new Set(['inch', 'inches', 'in', 'cm', 'centimeter', 'centimetre', 'mm']);

/**
 * A size stated without brackets: "2 28-ounce cans crushed tomatoes",
 * "1 6-inch tortilla", "1 2-pound-3-ounce can tomatoes".
 *
 * Exactly what `readParenthetical` handles, minus the brackets, and it left
 * "28-ounce cans crushed tomato" as the name. The count is what matters on a
 * shopping list — you take two cans off the shelf, not 56 ounces — so the size
 * is consumed and discarded, which is what the bracketed form already does.
 *
 * The giveaway is a second number where a unit should be. A real unit has to
 * follow it, so "1 1/2 cups" (already eaten as a mixed number) and ordinary
 * counts can't trip it.
 */
const SIZE_REGEX = /^(\d+(?:[./]\d+)?)\s*-?\s*([a-zA-Z]+)\.?[\s-]+/;

const readSize: Stage = (r) => {
  if (r.quantity <= 0) return r;
  let rest = r.rest;

  // A loop, because recipes stack them: "1 2-pound-3-ounce can".
  for (;;) {
    const size = rest.match(SIZE_REGEX);
    if (!size) break;
    const word = size[2].toLowerCase();
    if (!canonicalUnit(word) && !LENGTH_WORDS.has(word)) break;
    const remainder = rest.slice(size[0].length).trim();
    // Never eat the whole line: "2 28-ounce" with nothing after it keeps what
    // it had rather than becoming nameless.
    if (!remainder) break;
    rest = remainder;
  }

  return rest === r.rest ? r : { ...r, rest: eatFiller(rest) };
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

/**
 * An open-ended amount: "30 or more basil leaves", "2 cups or so of stock".
 * The number is real; the hedge after it isn't part of the ingredient.
 */
const OPEN_ENDED_REGEX = /^(?:or\s+more|or\s+so|or\s+to\s+taste|plus\s+more)\b[,\s]*/i;

const readOpenEnded: Stage = (r) =>
  r.quantity > 0 ? { ...r, rest: eatFiller(r.rest.replace(OPEN_ENDED_REGEX, '').trim()) } : r;

/**
 * A second amount of the same thing: "2 tablespoons plus 2 teaspoons baking
 * powder", "1/3 cup plus 1/4 cup kirsch".
 *
 * Recipes write this when a measurement is awkward in one unit. It is one
 * ingredient with one total, and without handling it the whole tail — "plus 2
 * teaspoons baking powder" — became the name.
 *
 * The two amounts are summed when they convert to the same base, which is the
 * common case since the reason for writing it this way is that the amount
 * doesn't divide neatly. When they don't convert the second is dropped: a
 * slightly low amount on a correctly-named row beats an exact amount on a row
 * called "plus 2 teaspoons baking powder".
 */
const PLUS_REGEX = /^plus\s+/i;

const round = (n: number) => Math.round(n * 1e4) / 1e4;

const readPlusAmount: Stage = (r) => {
  if (r.quantity <= 0 || !PLUS_REGEX.test(r.rest)) return r;

  const afterPlus = r.rest.replace(PLUS_REGEX, '').trim();
  const second = matchLeadingQuantity(afterPlus);
  if (!second) return r;

  const afterQuantity = afterPlus.slice(second.length).trim();
  const word = afterQuantity.match(ONE_WORD_UNIT_REGEX);
  const secondUnit = word && canonicalUnit(word[1]);
  if (!word || !secondUnit) return r;

  const rest = eatFiller(afterQuantity.slice(word[0].length).trim());
  if (!rest) return r;

  // Same unit needs no conversion, and shouldn't get one: a round trip
  // through base units turns 1/3 + 1/4 into something with a tail on it.
  if (secondUnit === r.unit) {
    return { ...r, rest, quantity: round(r.quantity + second.value) };
  }

  const here = toBase(r.quantity, r.unit);
  const there = toBase(second.value, secondUnit);
  const perUnit = toBase(1, r.unit);
  if (!here || !there || !perUnit || here.baseUnit !== there.baseUnit) {
    return { ...r, rest };
  }
  // Back into the unit the line opened with, which is the one the cook wrote.
  // Rounded because our conversion constants aren't exact multiples of each
  // other — 3 tsp is 14.78676 mL and a tablespoon is 14.7868 — and a quantity
  // with fourteen decimal places on it helps nobody.
  return { ...r, rest, quantity: round((here.quantity + there.quantity) / perUnit.quantity) };
};

/** The same amount restated in the other system — see `eatEcho`. */
const readEcho: Stage = (r) => (r.quantity > 0 ? { ...r, rest: eatEcho(r.rest, r.unit) } : r);

/**
 * A part of something rather than the thing: "juice of 1 lemon", "zest of 2
 * oranges", "leaves from 1 bunch of parsley".
 *
 * You buy the lemon, so the count belongs to the lemon — this used to leave
 * the quantity at 0 because the line doesn't open with a number. The part is
 * carried through and rejoined to the name at the end, giving "lemon juice",
 * which is what every other phrasing of it normalizes to.
 *
 * Only the parts that read as a product. "leaves of parsley" is parsley, and
 * "parsley leaves" is a worse name for it than "parsley".
 */
const DERIVED_REGEX = /^(?:([a-z-]+)\s+)?(juice|zest|peel|rind)\s+(?:of|from)\s+/i;

const readDerived: Stage = (r) => {
  const match = r.rest.match(DERIVED_REGEX);
  if (!match) return r;
  // A leading word is only allowed when it's a descriptor — "grated zest of 1
  // lemon" yes, "orange juice of some kind" no.
  if (match[1] && !MODIFIER_WORDS.has(match[1].toLowerCase())) return r;

  const rest = r.rest.slice(match[0].length).trim();
  if (!rest) return r;
  return { ...r, rest, derivative: match[2].toLowerCase() };
};

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
const wordsIn = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Which option to keep, or null to keep the phrase whole.
 *
 * Two alternations can have exactly the same shape and opposite answers:
 *
 *     "butter or olive oil"      — two things, keep "butter"
 *     "olive or vegetable oil"   — one thing twice, keep "olive oil"
 *
 * so there is no structural rule that separates them, only a vocabulary. Three
 * ways to be confident, and silence otherwise:
 *
 *   1. The options are parallel — same word count — so neither can be missing
 *      a shared head. "milk or cream", "olive oil or vegetable oil".
 *   2. The later option opens with its own amount, which a shared head never
 *      does. "chicken thighs or 2 lb beef".
 *   3. The last option's final word completes the first into something the app
 *      recognizes as food. "olive" + "oil" is a thing; "butter" + "oil" isn't,
 *      so "butter or olive oil" falls through to (1)/(2) instead.
 *
 * When none of those holds the whole phrase is kept, exactly as it was before
 * alternatives were handled at all. A long name is honest; a row called
 * "vegetable" or "white" is not.
 */
function chooseOption(options: string[]): string | null {
  const first = options[0].trim();
  const last = options[options.length - 1].trim();
  if (!first || !last) return null;

  const firstWords = wordsIn(first);
  const lastWords = wordsIn(last);

  if (firstWords.length === 1 && lastWords.length > 1) {
    const head = lastWords[lastWords.length - 1];
    // (3) The first option completes into something real: "olive" + "oil",
    // "black" + "pepper", "white" + "sugar".
    if (isKnownFoodPhrase(`${first} ${head}`)) return `${first} ${head}`;
    // Otherwise a standalone food beats a shared head: "butter or olive oil"
    // is two things, and "butter oil" is not a product.
    if (isKnownFoodPhrase(first)) return first;
    // A modifier in front of a food we recognize is the shared-head shape
    // again — "fresh or frozen blueberries". The modifier test is what keeps
    // "water or chicken broth" out: water is an ingredient, not a description.
    if (MODIFIER_WORDS.has(first.toLowerCase()) && isKnownFoodPhrase(head)) {
      return `${first} ${head}`;
    }
    return null;
  }
  if (firstWords.length === lastWords.length) return first;
  if (matchLeadingQuantity(last)) return first;
  if (isKnownFoodPhrase(first)) return first;
  return null;
}

const readAlternative: Stage = (r) => {
  let name = r.name;
  const alternatives: string[] = [];

  const parenAlternative = name.match(PAREN_ALTERNATIVE_REGEX);
  if (parenAlternative) {
    alternatives.push(parenAlternative[1].trim());
    name = name.replace(PAREN_ALTERNATIVE_REGEX, '').trim();
  }

  const options = name.split(ALTERNATIVE_REGEX);
  if (options.length > 1) {
    const chosen = chooseOption(options);
    if (chosen) {
      name = chosen;
      // Every option we didn't keep, not just the first — "butter (or
      // margarine) or ghee" used to lose the ghee entirely.
      alternatives.push(...options.slice(1).map((o) => o.trim()));
    }
  }

  const kept = alternatives.filter(Boolean);
  if (kept.length === 0) return { ...r, name };

  const note = `or ${kept.join(' or ')}`;
  return { ...r, name, notes: r.notes ? `${note}; ${r.notes}` : note };
};

/**
 * Verbs that mean the line stopped naming an ingredient and started telling
 * you what to do with it — item 7.
 *
 * Deliberately short, and deliberately *not* the prep words. `chopped`,
 * `crushed`, `ground`, `whipped`, `sweetened`, `shredded` and friends are
 * descriptors that sit in front of a noun ("frozen chopped spinach"), and
 * normalize.ts already strips those. Cutting at one of them would take the
 * ingredient with it.
 *
 * What's here is either a bare imperative or a participle with no adjectival
 * use worth worrying about.
 */
const INSTRUCTION_VERBS = new Set([
  'dissolve',
  'dissolved',
  'combine',
  'combined',
  'preheat',
  'marinate',
  'rinse',
  'soak',
  'simmer',
  'refrigerate',
  'whisk',
  'knead',
  'blanch',
  'sprinkle',
  'drizzle',
  'reserve',
  'discard',
]);

/**
 * Truncates at the point a line stops being an ingredient — item 7.
 *
 * "1 tablespoon of all purpose flour dissolve in 1/4 cup water" is a
 * measurement, an ingredient, and then a step. The name keeps the ingredient;
 * the rest becomes a note rather than being thrown away, and `originalString`
 * still has the whole line.
 *
 * Two conditions keep this timid, which is the point — getting it wrong
 * deletes something you needed to buy:
 *
 *   - **not the first word.** Nothing before the verb means nothing to keep,
 *     so "Preheat oven to 350°F" is left exactly as it is. It's an ugly row,
 *     but an ugly row is recoverable and a missing one isn't.
 *   - **not the last word.** A trailing verb is far more likely a noun or an
 *     adjective — "cake mix", "pancake mix" — than an instruction with
 *     nothing after it.
 */
/**
 * Words that join a step to what it acts on. A step says where or what to do
 * it *to*; a product name doesn't. "dissolve **in** water", "combine **with**
 * the cornstarch", "rinse **until** it runs clear" — against "simmer sauce"
 * and "sprinkle topping", which are things on a shelf.
 */
const STEP_CONNECTIVES = new Set([
  'in',
  'into',
  'with',
  'until',
  'to',
  'on',
  'over',
  'onto',
  'before',
  'after',
  'then',
  'and',
  'at',
  'for',
  'from',
  'together',
]);

/** Trailing joining words left behind by a cut: "olive oil to" → "olive oil". */
const TRAILING_CONNECTIVE = /\s+(?:to|for|and|or|with|in|into|on|onto|then|until|at|from)$/i;

const truncateAtInstruction: Stage = (r) => {
  const words = r.name.split(/\s+/).filter(Boolean);
  const at = words.findIndex(
    (word, i) =>
      i > 0 &&
      i < words.length - 1 &&
      INSTRUCTION_VERBS.has(word.toLowerCase().replace(/[.,;:]+$/, '')),
  );
  if (at === -1) return r;

  const dropped = words.slice(at).join(' ');
  // A verb with no connective after it is naming a product, not giving an
  // instruction: "tikka masala simmer sauce", "chocolate sprinkle topping".
  if (!words.slice(at + 1).some((w) => STEP_CONNECTIVES.has(w.toLowerCase()))) return r;

  // The cut lands after the word that introduced the step, so "olive oil to
  // drizzle on top" would keep the "to".
  const name = words.slice(0, at).join(' ').replace(TRAILING_CONNECTIVE, '').trim();
  // Nothing recognizable left to buy. Leaving the line ugly is the whole
  // policy here — parseIngredientLines deletes a name that is only a joining
  // word, so truncating to one would silently drop the row.
  if (!name || JOINING_WORD_ONLY.test(name)) return r;

  return { ...r, name, notes: r.notes ? `${dropped}; ${r.notes}` : dropped };
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
  // The name is normalized *before* the part is rejoined, because the stemmer
  // only ever works on the last word: "juice of 2 lemons" has to become
  // "lemon juice", not "lemons juice".
  const base = normalizeIngredientName(r.name);
  const name = r.derivative ? normalizeIngredientName(`${base} ${r.derivative}`) : base;
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
  readDerived,
  readQuantity,
  readSize,
  readBareUnit,
  readUnit,
  readParenthetical,
  readEcho,
  readPlusAmount,
  readOpenEnded,
  splitNotes,
  readAlternative,
  truncateAtInstruction,
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
 * Two ingredients written on one line: "Salt and pepper to taste".
 *
 * Splitting on "and" is dangerous in a way splitting on "or" is not, because
 * plenty of single products have one in the middle — macaroni and cheese, half
 * and half, sweet and sour sauce, chicken and rice. Two guards, and between
 * them every one of those survives:
 *
 *   - **No quantity.** An amount belongs to one thing. "1 box macaroni and
 *     cheese" has one and is left alone; "salt and pepper to taste" hasn't.
 *   - **Both halves name something we recognize.** "sweet" is not a food, so
 *     "sweet and sour sauce" cannot split even without a quantity.
 *
 * The qualifier carries to both halves, because "to taste" was said about the
 * pair. Each keeps the whole original line — they genuinely came from it, and
 * the recipe page still shows what was written.
 */
function splitCompound(ing: Ingredient, corrections: CorrectionIndex): Ingredient[] {
  if (ing.quantity !== 0 || ing.unit) return [ing];
  const halves = ing.name.split(/\s+and\s+/i);
  if (halves.length !== 2) return [ing];

  const parsed = halves.map((half) => applyCorrection(parseIngredient(half), corrections));
  if (!parsed.every((p) => p.name && isKnownFoodPhrase(p.name))) return [ing];

  return parsed.map((p) => ({
    ...p,
    originalString: ing.originalString,
    ...(ing.qualifier && !p.qualifier ? { qualifier: ing.qualifier } : {}),
  }));
}

/**
 * Parses a list of raw ingredient lines, dropping the ones that name nothing.
 *
 * `corrections` overrule the parse for lines someone has said it got wrong.
 * They're applied last, after every rule has had its go, so a correction is
 * always the final word — that's the whole promise of the button.
 */
export function parseIngredientLines(
  lines: string[],
  corrections: CorrectionIndex = EMPTY_INDEX,
): Ingredient[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => applyCorrection(parseIngredient(line), corrections))
    .flatMap((ing) => splitCompound(ing, corrections))
    .filter((ing) => ing.name && !namesNothing(ing.name));
}
