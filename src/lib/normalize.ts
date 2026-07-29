import { KNOWN_FOOD_PHRASES } from './categories';

/**
 * Ingredient name normalization: lowercase, trim adjectives/synonyms via a
 * curated mapping, and a light suffix stripper so "tomatoes" and "tomato"
 * aggregate together.
 */

/** Curated synonym map. Keys and values are lowercase singular-ish forms. */
const SYNONYMS: Record<string, string> = {
  'yellow onion': 'onion',
  'brown onion': 'onion',
  'white onion': 'onion',
  'red onion': 'red onion', // distinct enough to keep separate
  'spring onion': 'scallion',
  'green onion': 'scallion',
  scallion: 'scallion',
  'garlic clove': 'garlic',
  'clove of garlic': 'garlic',
  'cloves garlic': 'garlic',
  garlic: 'garlic',
  'red bell pepper': 'bell pepper',
  'green bell pepper': 'bell pepper',
  'yellow bell pepper': 'bell pepper',
  'orange bell pepper': 'bell pepper',
  capsicum: 'bell pepper',
  'roma tomato': 'tomato',
  'plum tomato': 'tomato',
  'vine tomato': 'tomato',
  'cherry tomato': 'cherry tomato',
  'coriander leaves': 'cilantro',
  'fresh coriander': 'cilantro',
  'coriander leaf': 'cilantro',
  'all-purpose flour': 'flour',
  'all purpose flour': 'flour',
  'plain flour': 'flour',
  'ap flour': 'flour',
  'granulated sugar': 'sugar',
  'white sugar': 'sugar',
  'caster sugar': 'sugar',
  'kosher salt': 'salt',
  'sea salt': 'salt',
  'table salt': 'salt',
  'fine salt': 'salt',
  'extra virgin olive oil': 'olive oil',
  'extra-virgin olive oil': 'olive oil',
  evoo: 'olive oil',
  'unsalted butter': 'butter',
  'salted butter': 'butter',
  'whole milk': 'milk',
  'skim milk': 'milk',
  '2% milk': 'milk',
  'large egg': 'egg',
  'large eggs': 'egg',
  'medium egg': 'egg',
  'small egg': 'egg',
  'freshly ground black pepper': 'black pepper',
  'ground black pepper': 'black pepper',
  'cracked black pepper': 'black pepper',
  'boneless skinless chicken breast': 'chicken breast',
  'boneless chicken breast': 'chicken breast',
  'skinless chicken breast': 'chicken breast',
  'chicken breast half': 'chicken breast',
  'chicken breast halves': 'chicken breast',
  'italian parsley': 'parsley',
  'flat-leaf parsley': 'parsley',
  'flat leaf parsley': 'parsley',
  'fresh parsley': 'parsley',
  'baby spinach': 'spinach',
  'fresh spinach': 'spinach',
  'parmesan cheese': 'parmesan',
  'parmigiano reggiano': 'parmesan',
  'parmigiano-reggiano': 'parmesan',
  'cheddar cheese': 'cheddar',
  'sharp cheddar': 'cheddar',
  'sharp cheddar cheese': 'cheddar',
  'low-sodium soy sauce': 'soy sauce',
  'light soy sauce': 'soy sauce',
  'low sodium chicken broth': 'chicken broth',
  'low-sodium chicken broth': 'chicken broth',
  'chicken stock': 'chicken broth',
  'vegetable stock': 'vegetable broth',
  'long-grain rice': 'rice',
  'long grain rice': 'rice',
  'white rice': 'rice',
  'basmati rice': 'basmati rice',
  'fresh ginger': 'ginger',
  'ginger root': 'ginger',
  'fresh lemon juice': 'lemon juice',
  'juice of 1 lemon': 'lemon juice',
  'fresh lime juice': 'lime juice',
  'juice of 1 lime': 'lime juice',
  'heavy whipping cream': 'heavy cream',
  'double cream': 'heavy cream',
};

/**
 * Leading descriptors that rarely change what you buy. Includes prep/
 * technique words (chopped, minced, ...) so "1 cup chopped onion" and "1/2
 * cup minced onion" both normalize to "onion" and merge on the shopping
 * list — DROPPABLE_SUFFIXES already stripped these when they trailed the
 * name after a comma ("onion, chopped"), but a bare leading adjective like
 * "chopped onion" fell through untouched.
 */
const DROPPABLE_PREFIXES = [
  'fresh',
  'freshly',
  'large',
  'medium',
  'small',
  'ripe',
  'raw',
  'cold',
  'warm',
  'room temperature',
  'organic',
  'good quality',
  'good-quality',
  'finely',
  'roughly',
  'thinly',
  'coarsely',
  'lightly',
  'chopped',
  'diced',
  'minced',
  'sliced',
  'grated',
  'shredded',
  'peeled',
  'crushed',
  'melted',
  'softened',
  'beaten',
];

/**
 * Phrases a recipe uses in place of an amount.
 *
 * Here rather than in the parser because the parser already imports this
 * module, and both need the same list — one to record it, one to strip it.
 */
export const QUALIFIERS = [
  'to taste',
  'as needed',
  'for serving',
  'for garnish',
  'for frying',
  'for dusting',
  'for greasing',
] as const;

/** Trailing preparation words that describe technique, not the item. */
const DROPPABLE_SUFFIXES = [
  'chopped',
  'diced',
  'minced',
  'sliced',
  'grated',
  'shredded',
  'peeled',
  'crushed',
  'melted',
  'softened',
  'beaten',
  'divided',
  'optional',
  'plus more',
  // Kept in step with QUALIFIERS below: the parser records these as the
  // amount, and the name has to lose them or "oil for frying" ends up named
  // "oil for frying" with "for frying" also in its amount column.
  ...QUALIFIERS,
];

/**
 * Item 8 — the words in DROPPABLE_PREFIXES are descriptors *usually*, and name
 * a different product in front of a particular few things.
 *
 * `raw sugar` is demerara, not sugar. `fresh pasta` and dried pasta are two
 * different aisles. Keyed by the prefix, listing the heads it must not be
 * taken off.
 *
 * A vocabulary rather than a rule, because there isn't a rule: whether a word
 * is a descriptor depends entirely on what follows it. Over-merging is the
 * failure that matters here — it's invisible, and it makes you buy the wrong
 * thing — so anything genuinely ambiguous belongs on this list.
 */
const IDENTITY_MODIFIERS: Record<string, readonly string[]> = {
  raw: ['sugar', 'cane sugar', 'honey', 'cacao', 'cocoa'],
  fresh: ['mozzarella', 'pasta', 'yeast'],
};

/**
 * Words that must never be added to DROPPABLE_PREFIXES or DROPPABLE_SUFFIXES.
 *
 * Every one of them separates two things you can buy — white pepper is not
 * black pepper, smoked paprika is not paprika, roasted red peppers are not red
 * peppers. Pinned by a test, because the damage from adding one is silent:
 * two rows merge and the shopping list is confidently wrong.
 */
export const NEVER_DROPPABLE = [
  'heavy',
  'double',
  'black',
  'white',
  'smoked',
  'dark',
  'sweet',
  'sour',
  'wild',
  'golden',
  'red',
  'green',
  'coarse',
  'toasted',
  'roasted',
  'unsweetened',
  'condensed',
] as const;

const LEADING_JOINING_WORD = /^(?:of|a|an|and|or|to|for|with|the)\b/i;

/** What joins two descriptors: "peeled and cooked", "rinsed, drained". */
const LEADING_CONJUNCTION = /^(?:and|,)\s+/i;

const startsWithDescriptor = (s: string) =>
  DROPPABLE_PREFIXES.some((p) => s === p || s.startsWith(p + ' '));

/**
 * Every word this module treats as a modifier rather than a thing — the ones
 * it strips, plus the ones it deliberately keeps.
 *
 * Exported because the parser needs the same question answered: in "fresh or
 * frozen blueberries" the first option is a modifier and the head noun is
 * shared, while in "water or chicken broth" it isn't and they're two
 * ingredients.
 */
export const MODIFIER_WORDS: ReadonlySet<string> = new Set([
  ...DROPPABLE_PREFIXES,
  ...NEVER_DROPPABLE,
]);

/** Whether `prefix` is part of the identity of `head` rather than a description of it. */
function isIdentityModifier(prefix: string, head: string): boolean {
  const heads = IDENTITY_MODIFIERS[prefix];
  if (!heads) return false;
  const singular = stemLastWord(head);
  return heads.some(
    (h) => head === h || head.startsWith(h + ' ') || singular === h || singular.startsWith(h + ' '),
  );
}

/**
 * Optimized affix stripping: separate forward and backward passes with early
 * termination on each match. Avoids O(n²) behavior of nested loops checking
 * all affixes repeatedly.
 */
function stripAffixes(name: string): string {
  let out = name;

  // Forward pass: strip all leading prefixes
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of DROPPABLE_PREFIXES) {
      if (!out.startsWith(p + ' ')) continue;
      const head = out.slice(p.length + 1);
      // Not a descriptor in front of this particular thing. Matched against
      // the stemmed head as well, because stemming happens *after* this pass —
      // without it "raw sugars" strips to "sugars" and only then becomes
      // "sugar", which is precisely the silent over-merge the table exists to
      // stop.
      if (isIdentityModifier(p, head)) continue;

      // "peeled and cooked fresh chestnuts" — recipes join descriptors with
      // "and", and stripping one at a time stalls on the conjunction. Eat it
      // too, but only when another descriptor genuinely follows.
      const joined = head.replace(LEADING_CONJUNCTION, '');
      const conjoined = joined !== head && startsWithDescriptor(joined);
      const next = conjoined ? joined : head;

      // Never strip a word if doing so leaves a fragment at the front.
      // "fresh or frozen blueberries" would otherwise become "or frozen
      // blueberries" — a name that reads as a parse failure, and one the
      // output invariants reject.
      if (LEADING_JOINING_WORD.test(next)) continue;
      out = next;
      changed = true;
      break; // Restart after each match
    }
  }

  // Backward pass: strip all trailing suffixes
  changed = true;
  while (changed) {
    changed = false;
    for (const s of DROPPABLE_SUFFIXES) {
      if (out.endsWith(' ' + s)) {
        out = out.slice(0, -(s.length + 1));
        changed = true;
        break; // Restart after each match
      } else if (out.endsWith(', ' + s)) {
        out = out.slice(0, -(s.length + 2));
        changed = true;
        break; // Restart after each match
      }
    }
  }

  return out.trim();
}

/** Light stemmer: strips plural endings from the final word ("tomatoes" → "tomato"). */
function stemLastWord(name: string): string {
  const words = name.split(' ');
  const last = words[words.length - 1];
  let stemmed = last;
  if (last.length > 3) {
    if (last.endsWith('oes')) stemmed = last.slice(0, -2);
    else if (last.endsWith('ies')) stemmed = last.slice(0, -3) + 'y';
    else if (
      last.endsWith('ses') ||
      last.endsWith('xes') ||
      last.endsWith('ches') ||
      last.endsWith('shes')
    ) {
      stemmed = last.slice(0, -2);
    } else if (last.endsWith('s') && !last.endsWith('ss') && !last.endsWith('us')) {
      stemmed = last.slice(0, -1);
    }
  }
  words[words.length - 1] = stemmed;
  return words.join(' ');
}

/**
 * Whether a phrase names something you could actually buy.
 *
 * A small lexicon assembled from what the app already knows: the synonym map's
 * keys and values, plus the aisle keyword table. Exact matches only — "butter"
 * is in it and "butter oil" is not, which is the entire point.
 *
 * Used by the parser to tell two identically-shaped alternations apart:
 * "butter or olive oil" offers two things, while "olive or vegetable oil"
 * offers one thing twice. No structural rule can separate those, so it takes a
 * vocabulary.
 */
const KNOWN_NAMES: ReadonlySet<string> = new Set([
  ...Object.keys(SYNONYMS),
  ...Object.values(SYNONYMS),
  ...KNOWN_FOOD_PHRASES,
]);

export function isKnownFoodPhrase(phrase: string): boolean {
  const clean = phrase.trim().toLowerCase();
  // The lexicon is singular, recipes are not. Stemming here rather than at
  // every call site — "blueberries" has to find "blueberry", and "butter oil"
  // still has to find nothing.
  return KNOWN_NAMES.has(clean) || KNOWN_NAMES.has(stemLastWord(clean));
}

/**
 * Normalizes an ingredient name for aggregation:
 * lowercase → strip descriptors → synonym map → plural stemming → synonym map again.
 */
export function normalizeIngredientName(raw: string): string {
  let name = raw
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, ' ') // drop parentheticals
    .replace(/[*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '');

  if (!name) return name;
  if (SYNONYMS[name]) return SYNONYMS[name];

  name = stripAffixes(name);
  if (SYNONYMS[name]) return SYNONYMS[name];

  name = stemLastWord(name);
  if (SYNONYMS[name]) return SYNONYMS[name];

  return name;
}
