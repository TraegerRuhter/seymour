import type { MealType } from './types';

/**
 * Best-effort meal-type / category / main-ingredient suggestions from a
 * recipe's title and ingredient list. Keyword-based (same "longest match
 * wins" spirit as categories.ts) so it works fully offline with zero
 * dependencies — no API key required, deterministic, and testable.
 *
 * Deliberately conservative on meal type: an untagged recipe already "fits
 * anywhere" (see recipeFitsMealType), which is the safe default a wrong tag
 * would make worse. A dish only gets a mealType on a clear signal; anything
 * ambiguous is left for the user to tag by hand — same as it is today.
 */

const PROTEIN_WORDS = [
  'chicken',
  'beef',
  'pork',
  'lamb',
  'turkey',
  'bacon',
  'sausage',
  'ham',
  'salmon',
  'tuna',
  'shrimp',
  'prawn',
  'cod',
  'tilapia',
  'scallop',
  'crab',
  'lobster',
  'steak',
  'duck',
  'tofu',
  'lentil',
  'chickpea',
  'black bean',
];

// Unambiguous even alongside a protein ("chicken and waffles" is still
// breakfast) — checked before the dessert branch so it always wins there.
const BREAKFAST_WORDS = [
  'pancake',
  'waffle',
  'omelet',
  'omelette',
  'french toast',
  // Bare "granola" is deliberately absent: it's genuinely ambiguous between
  // granola-as-cereal (breakfast) and "granola bar" (snack, below), and
  // since breakfast is checked first, keeping it here made "granola bar"
  // unreachable — the more specific snack phrase never got a chance to
  // match. Left untagged rather than guessed, same as any other ambiguous
  // title.
  'oatmeal',
  'porridge',
  'breakfast',
  'hash brown',
  'frittata',
  'quiche',
  'cinnamon roll',
  'bagel',
  'crepe',
  'overnight oats',
];

const SNACK_WORDS = [
  'dip',
  'trail mix',
  'popcorn',
  'snack',
  'granola bar',
  'energy bar',
  'hummus',
  'guacamole',
  'nachos',
];

// Never ambiguous with a savory dish, so these win regardless of a protein
// word also being present.
const STRONG_DESSERT_WORDS = [
  'ice cream',
  'sorbet',
  'gelato',
  'cheesecake',
  'cupcake',
  'brownie',
  'macaron',
  'custard',
  'mousse',
  'fudge',
  'truffle',
  'meringue',
  'sundae',
  'shortcake',
  'dessert',
];

// Ambiguous with savory dishes ("chicken pot pie", "crab cake") — only
// counted as dessert when no protein word is also present.
const AMBIGUOUS_DESSERT_WORDS = ['cake', 'pie', 'cookie', 'tart', 'crumble', 'cobbler', 'candy'];

const ENTREE_WORDS = [
  'soup',
  'stew',
  'curry',
  'casserole',
  'stir fry',
  'stir-fry',
  'taco',
  'burrito',
  'sandwich',
  'burger',
  'pasta',
  'lasagna',
  'chili',
  'skillet',
  'bowl',
  'meatloaf',
];

// Word-boundary match, not plain substring — otherwise "pancakes" would
// trip the dessert word "cake", "hamburger" the protein word "ham", etc.
function containsWord(haystack: string, needle: string): boolean {
  const i = haystack.indexOf(needle);
  if (i === -1) return false;
  const before = i === 0 ? '' : haystack[i - 1];
  const after = i + needle.length >= haystack.length ? '' : haystack[i + needle.length];
  const boundary = (c: string) => c === '' || !/[a-z0-9]/.test(c);
  return boundary(before) && boundary(after);
}

/** Word-boundary match that also accepts the plural ("pancake" ~ "pancakes"). */
function matchesWord(haystack: string, word: string): boolean {
  return (
    containsWord(haystack, word) ||
    containsWord(haystack, word + 's') ||
    containsWord(haystack, word + 'es')
  );
}

function includesAny(haystack: string, words: string[]): boolean {
  return words.some((w) => matchesWord(haystack, w));
}

/**
 * Suggests meal-type tags from a title (and ingredient list, for the
 * protein signal only — checking ingredients against dessert/breakfast
 * words too easily misfires on things like a mole sauce's chocolate).
 * Returns [] when nothing is confident enough to tag, same as an untagged
 * recipe today.
 */
function hasProteinSignal(title: string, ingredientNames: string[]): boolean {
  const t = title.toLowerCase();
  const ingredientText = ingredientNames.join(' ').toLowerCase();
  return includesAny(t, PROTEIN_WORDS) || includesAny(ingredientText, PROTEIN_WORDS);
}

export function suggestMealTypes(title: string, ingredientNames: string[]): MealType[] {
  const t = title.toLowerCase();
  const hasProtein = hasProteinSignal(title, ingredientNames);

  if (
    includesAny(t, STRONG_DESSERT_WORDS) ||
    (!hasProtein && includesAny(t, AMBIGUOUS_DESSERT_WORDS))
  ) {
    return ['dessert'];
  }
  if (includesAny(t, BREAKFAST_WORDS)) return ['breakfast'];
  if (includesAny(t, SNACK_WORDS)) return ['snack'];
  if (hasProtein || includesAny(t, ENTREE_WORDS)) return ['lunch', 'dinner'];
  return [];
}

const CATEGORY_HINTS: [string, string][] = [
  ['soup', 'Soup'],
  ['stew', 'Soup'],
  ['chili', 'Soup'],
  ['salad', 'Salad'],
  ['lasagna', 'Pasta'],
  ['spaghetti', 'Pasta'],
  ['noodle', 'Pasta'],
  ['pasta', 'Pasta'],
  ['curry', 'Curry'],
  ['stir fry', 'Stir-fry'],
  ['stir-fry', 'Stir-fry'],
  ['enchilada', 'Mexican'],
  ['quesadilla', 'Mexican'],
  ['taco', 'Mexican'],
  ['burrito', 'Mexican'],
  ['burger', 'Sandwich'],
  ['sandwich', 'Sandwich'],
  ['wrap', 'Sandwich'],
  ['cheesecake', 'Dessert'],
  ['ice cream', 'Dessert'],
  ['cookie', 'Dessert'],
  ['brownie', 'Dessert'],
  ['cake', 'Dessert'],
  ['pie', 'Dessert'],
  ['pancake', 'Breakfast'],
  ['waffle', 'Breakfast'],
  ['omelet', 'Breakfast'],
  ['oatmeal', 'Breakfast'],
  ['casserole', 'Casserole'],
  ['pizza', 'Pizza'],
];

/**
 * Prefers a category the user already uses in their collection, so a
 * suggestion joins the existing filter chips on the Recipes page instead of
 * splintering them into near-duplicates ("Soup" vs. "Soups"). Falls back to
 * a small canonical guess when nothing already in use matches the title.
 */
export function suggestCategory(
  title: string,
  ingredientNames: string[],
  existingCategories: string[],
): string | undefined {
  const t = title.toLowerCase();
  // Trailing-s-insensitive so "Soups" still matches a "Tomato Soup" title.
  const singular = (s: string) => s.trim().toLowerCase().replace(/s$/, '');
  const existing = existingCategories.find((c) => {
    const stem = singular(c);
    return stem && matchesWord(t, stem);
  });
  if (existing) return existing;

  // "cake"/"pie" are the same savory/dessert ambiguity suggestMealTypes
  // already guards against ("chicken pot pie", "crab cakes") — without this,
  // the two functions could confidently disagree on the same recipe's tags.
  const hasProtein = hasProteinSignal(title, ingredientNames);
  const hints = hasProtein
    ? CATEGORY_HINTS.filter(([word]) => !AMBIGUOUS_DESSERT_WORDS.includes(word))
    : CATEGORY_HINTS;
  const hint = hints.find(([word]) => matchesWord(t, word));
  return hint?.[1];
}

/** First protein-ish word found among the ingredient names, in listed order. */
export function suggestMainIngredient(ingredientNames: string[]): string | undefined {
  for (const name of ingredientNames) {
    const n = name.toLowerCase();
    const hit = PROTEIN_WORDS.find((w) => matchesWord(n, w));
    if (hit) return hit;
  }
  return undefined;
}

export interface TagSuggestions {
  mealTypes: MealType[];
  category?: string;
  mainIngredient?: string;
}

export function suggestTags(
  title: string,
  ingredientNames: string[],
  existingCategories: string[] = [],
): TagSuggestions {
  return {
    mealTypes: suggestMealTypes(title, ingredientNames),
    category: suggestCategory(title, ingredientNames, existingCategories),
    mainIngredient: suggestMainIngredient(ingredientNames),
  };
}
