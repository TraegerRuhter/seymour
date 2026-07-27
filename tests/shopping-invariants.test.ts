import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, parseIngredientLines } from '../src/lib/ingredient-parser.ts';
import { aggregateIngredients } from '../src/lib/aggregate.ts';
import type { ShoppingListItem } from '../src/lib/types.ts';
import { SETTLED } from './corpus.ts';
import { ALL_RULE_IDS, shoppingListViolations } from './invariants.ts';

/**
 * Item 10 of docs/shopping-parser.md — assertions the aggregated list must
 * always satisfy, run over the corpus from item 4.
 *
 * The point is coverage of the *class* rather than of six examples: every
 * remaining item on that list (alternatives, instruction lines, descriptor
 * vocabulary) is a heuristic that can fail in a new way, and each of those new
 * ways still lands on one of these rules.
 */

const row = (over: Partial<ShoppingListItem> = {}): ShoppingListItem => ({
  id: 'flour|g',
  ingredientName: 'flour',
  totalQuantity: 250,
  unit: 'g',
  checked: false,
  ...over,
});

test('the whole corpus, aggregated as one shop, satisfies every invariant', () => {
  const list = aggregateIngredients(SETTLED.map((c) => parseIngredient(c.line)));
  assert.ok(list.length > 20, `only ${list.length} rows — the corpus stopped feeding this`);
  assert.deepEqual(shoppingListViolations(list), []);
});

test('and so does each line on its own', () => {
  // A row can hide in the combined list: dedupe drops an unmeasured duplicate,
  // and a bad name merges into a bucket nobody looks at twice. One line at a
  // time, nothing gets absorbed.
  const bad = SETTLED.flatMap((c) =>
    shoppingListViolations(aggregateIngredients([parseIngredient(c.line)])),
  );
  assert.deepEqual(bad, [], `\n${bad.join('\n')}`);
});

test('a line that names nothing never reaches the list', () => {
  // Found by these rules on their first run: a scraper leaving a bare "of" or
  // "or" on its own row produced a shopping row called "of". Dropped at
  // parseIngredientLines, which is the path every import and save takes, so
  // the aggregated list never sees it.
  assert.deepEqual(parseIngredientLines(['of', 'or', '  ']), []);
  assert.deepEqual(shoppingListViolations(aggregateIngredients(parseIngredientLines(['of']))), []);
});

test('a line with an ingredient attached is never dropped, however badly it parsed', () => {
  // The other half of that fix, and the more important one: throwing away
  // something you needed to buy is worse than an ugly row.
  const parsed = parseIngredientLines(['1 tablespoon of all purpose flour dissolve in water']);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].originalString, '1 tablespoon of all purpose flour dissolve in water');
});

// --- each rule has to actually be able to fire -----------------------------
//
// A checker that can't fail is worse than no checker: it reports green
// forever. Every rule below is handed the thing it exists to catch.

test('a fragment left on the front of a name is caught', () => {
  const found = shoppingListViolations([row({ ingredientName: 'of tomato' })]);
  assert.match(found.join('\n'), /name-fragment/);
});

test('a name that is only a unit word is caught', () => {
  const found = shoppingListViolations([row({ ingredientName: 'pinch' })]);
  assert.match(found.join('\n'), /name-is-a-unit/);
});

test('a measurement buried in a name is caught', () => {
  // The exact shape of the item 7 gap: an instruction that kept its numbers.
  const found = shoppingListViolations([
    row({ ingredientName: 'flour dissolve in 1/4 cup water' }),
  ]);
  assert.match(found.join('\n'), /name-holds-a-measurement/);
});

test('a plain number in a name is not mistaken for a measurement', () => {
  // "5 spice" is a name, not an amount — the rule only fires when the word
  // after the number is a real unit.
  assert.deepEqual(shoppingListViolations([row({ ingredientName: 'chinese 5 spice' })]), []);
});

test('a name that runs on like a sentence is caught', () => {
  const found = shoppingListViolations([
    row({ ingredientName: 'preheat the oven to degrees before you start' }),
  ]);
  assert.match(found.join('\n'), /name-too-long/);
});

test('a name at the limit is allowed through', () => {
  assert.deepEqual(
    shoppingListViolations([row({ ingredientName: 'boneless skinless chicken thigh' })]),
    [],
  );
});

test('an empty name is caught', () => {
  const found = shoppingListViolations([row({ ingredientName: '' })]);
  assert.match(found.join('\n'), /name-empty/);
});

test('a quantity that is not a number is caught', () => {
  const found = shoppingListViolations([row({ totalQuantity: NaN })]);
  assert.match(found.join('\n'), /quantity-finite/);
});

test('a negative quantity is caught', () => {
  const found = shoppingListViolations([row({ totalQuantity: -1 })]);
  assert.match(found.join('\n'), /quantity-negative/);
});

test('a unit the app cannot recognize is caught', () => {
  // Not "kilos" — that resolves to kg now. Something no alias reaches.
  const found = shoppingListViolations([row({ unit: 'smidgen' })]);
  assert.match(found.join('\n'), /unit-unknown/);
});

test('a unit with no number in front of it is caught', () => {
  // Reads as a broken row: "cups flour" with nothing where the amount goes.
  const found = shoppingListViolations([row({ totalQuantity: 0, unit: 'cup' })]);
  assert.match(found.join('\n'), /unit-without-amount/);
});

test('a stand-in phrase next to a real amount is caught', () => {
  // "2 cups salt, to taste" is one of those two things, not both.
  const found = shoppingListViolations([row({ qualifier: 'to taste' })]);
  assert.match(found.join('\n'), /qualifier-with-amount/);
});

test('two rows sharing an id are caught', () => {
  // The id carries the checked flag across a regenerate, so a duplicate would
  // make ticking one tick the other.
  const found = shoppingListViolations([row(), row({ ingredientName: 'sugar' })]);
  assert.match(found.join('\n'), /id-duplicated/);
});

test('an unmeasured row duplicating a measured one is caught', () => {
  const found = shoppingListViolations([
    row({ id: 'salt|g', ingredientName: 'salt', totalQuantity: 20 }),
    row({ id: 'salt|', ingredientName: 'salt', totalQuantity: 0, unit: '', qualifier: 'to taste' }),
  ]);
  assert.match(found.join('\n'), /row-redundant/);
});

test('every rule was exercised by the tests above', () => {
  // The list of ids is the checklist: adding a rule without a test that fires
  // it fails here, which is the only thing keeping the two in step.
  const exercised = new Set<string>();
  const cases: ShoppingListItem[][] = [
    [row({ ingredientName: 'of tomato' })],
    [row({ ingredientName: 'pinch' })],
    [row({ ingredientName: 'flour dissolve in 1/4 cup water' })],
    [row({ ingredientName: 'preheat the oven to degrees before you start' })],
    [row({ ingredientName: '' })],
    [row({ totalQuantity: NaN })],
    [row({ totalQuantity: -1 })],
    [row({ unit: 'smidgen' })],
    [row({ totalQuantity: 0, unit: 'cup' })],
    [row({ qualifier: 'to taste' })],
    [row(), row({ ingredientName: 'sugar' })],
    [
      row({ id: 'salt|g', ingredientName: 'salt', totalQuantity: 20 }),
      row({ id: 'salt|', ingredientName: 'salt', totalQuantity: 0, unit: '' }),
    ],
  ];
  for (const items of cases) {
    for (const violation of shoppingListViolations(items)) {
      const id = violation.match(/\[([a-z-]+)\]$/)?.[1];
      if (id) exercised.add(id);
    }
  }
  const unreachable = ALL_RULE_IDS.filter((id) => !exercised.has(id));
  assert.deepEqual(unreachable, [], `rules no test ever triggers: ${unreachable.join(', ')}`);
});
