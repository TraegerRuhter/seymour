import type { Ingredient, ShoppingListItem } from '../src/lib/types.ts';
import { canonicalUnit } from '../src/lib/units.ts';

/**
 * Item 10 of docs/shopping-parser.md — the things a shopping row must never
 * be, whatever the parser did to get there.
 *
 * Not a test file. It's the shared vocabulary the corpus test and the
 * aggregated-list test both assert against, so that "a row can't have a
 * measurement buried in its name" is written down once rather than drifting
 * between two files (which is exactly what happened to the qualifier list
 * before item 4 caught it).
 *
 * Every rule is phrased as `violated` — true when something is wrong — so a
 * failure message can just list the rules that fired.
 */

interface Rule<T> {
  id: string;
  /** Reads as the complaint, not the requirement: printed when it fires. */
  describes: string;
  violated(subject: T): boolean;
}

/**
 * A fragment left behind by a consumption step that didn't finish. "of
 * tomato" was the real one; the parenthetical branch used to expose it.
 */
const LEADING_STOPWORD = /^(?:of|a|an|and|or|to|for|with)\b/i;

/**
 * A second measurement inside the name: "flour dissolve in 1/4 cup water".
 * Any number immediately followed by a word the unit table recognizes.
 */
const NUMBER_THEN_WORD = /(?:^|\s)\d+(?:[./]\d+)?\s*([a-z]+)/gi;

function hasEmbeddedMeasurement(name: string): boolean {
  for (const match of name.matchAll(NUMBER_THEN_WORD)) {
    if (canonicalUnit(match[1])) return true;
  }
  return false;
}

/**
 * Long enough for "boneless skinless chicken thighs" and short enough that a
 * sentence can't pass as an ingredient.
 */
const MAX_NAME_WORDS = 6;

const wordCount = (name: string) => name.split(/\s+/).filter(Boolean).length;

/** Applied to a parsed ingredient and to an aggregated row alike. */
const NAME_RULES: Rule<string>[] = [
  {
    id: 'name-empty',
    describes: 'has no name at all',
    violated: (name) => name.trim() === '',
  },
  {
    id: 'name-fragment',
    describes: 'starts with a word left over from a half-finished strip',
    violated: (name) => LEADING_STOPWORD.test(name),
  },
  {
    id: 'name-is-a-unit',
    describes: 'is nothing but a unit word — the ingredient went missing',
    violated: (name) => canonicalUnit(name) !== null,
  },
  {
    id: 'name-holds-a-measurement',
    describes: 'has a second measurement buried in it',
    violated: hasEmbeddedMeasurement,
  },
  {
    id: 'name-too-long',
    describes: `runs past ${MAX_NAME_WORDS} words — that's an instruction, not a thing to buy`,
    violated: (name) => wordCount(name) > MAX_NAME_WORDS,
  },
];

/**
 * The subset that is about the app not breaking rather than the parse being
 * good: even a line we know parses badly has to satisfy these, because the
 * ledger renders it either way.
 */
const STRUCTURAL_RULE_IDS = new Set(['name-empty']);

const QUANTITY_RULES: Rule<{ quantity: number }>[] = [
  {
    id: 'quantity-finite',
    describes: 'has a quantity that is not a finite number',
    violated: ({ quantity }) => !Number.isFinite(quantity),
  },
  {
    id: 'quantity-negative',
    describes: 'has a negative quantity',
    violated: ({ quantity }) => quantity < 0,
  },
];

const ITEM_RULES: Rule<ShoppingListItem>[] = [
  {
    id: 'unit-unknown',
    describes: 'is measured in a unit the app cannot recognize',
    violated: (item) => item.unit !== '' && canonicalUnit(item.unit) !== item.unit,
  },
  {
    id: 'unit-without-amount',
    describes: 'shows a unit with no number in front of it',
    violated: (item) => item.unit !== '' && item.totalQuantity === 0,
  },
  {
    id: 'qualifier-with-amount',
    describes: 'carries a stand-in phrase even though it has a real amount',
    violated: (item) => item.qualifier !== undefined && item.totalQuantity > 0,
  },
];

function fired<T>(rules: Rule<T>[], subject: T, label: string): string[] {
  return rules.filter((r) => r.violated(subject)).map((r) => `${label} ${r.describes} [${r.id}]`);
}

/**
 * Checks a single parsed line. `structuralOnly` is for the corpus's known
 * gaps: a line we have already recorded as parsing wrongly would just fail
 * twice here, so only the rules about not breaking the UI apply to it.
 */
export function ingredientViolations(ing: Ingredient, structuralOnly = false): string[] {
  const nameRules = structuralOnly
    ? NAME_RULES.filter((r) => STRUCTURAL_RULE_IDS.has(r.id))
    : NAME_RULES;
  const label = `"${ing.originalString}" →`;
  return [
    ...fired(nameRules, ing.name, label),
    ...fired(QUANTITY_RULES, { quantity: ing.quantity }, label),
  ];
}

/** Checks the aggregated list — rows and the shape of the list as a whole. */
export function shoppingListViolations(items: ShoppingListItem[]): string[] {
  const found: string[] = [];

  for (const item of items) {
    const label = `"${item.ingredientName}" (${item.totalQuantity} ${item.unit || '—'})`;
    found.push(
      ...fired(NAME_RULES, item.ingredientName, label),
      ...fired(QUANTITY_RULES, { quantity: item.totalQuantity }, label),
      ...fired(ITEM_RULES, item, label),
    );
  }

  // Ids carry the checked flag and any manual override across a regenerate,
  // so two rows sharing one would tick each other.
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) found.push(`two rows share the id "${item.id}" [id-duplicated]`);
    seen.add(item.id);
  }

  // "salt, to taste" next to "3 pinches salt" is two rows that both mean buy
  // salt. aggregate.ts drops the unmeasured one; this is the assertion that
  // it kept doing so.
  const measured = new Set(items.filter((i) => i.totalQuantity > 0).map((i) => i.ingredientName));
  for (const item of items) {
    if (item.totalQuantity === 0 && measured.has(item.ingredientName)) {
      found.push(`"${item.ingredientName}" appears both measured and unmeasured [row-redundant]`);
    }
  }

  return found;
}

/** Every rule id, so a test can prove each one is reachable. */
export const ALL_RULE_IDS = [
  ...NAME_RULES.map((r) => r.id),
  ...QUANTITY_RULES.map((r) => r.id),
  ...ITEM_RULES.map((r) => r.id),
  'id-duplicated',
  'row-redundant',
];
