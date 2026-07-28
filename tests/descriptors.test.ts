import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIngredientName, NEVER_DROPPABLE } from '../src/lib/normalize.ts';
import { aggregateIngredients } from '../src/lib/aggregate.ts';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';

/**
 * Item 8 of docs/shopping-parser.md — when is "heavy cream" just "cream"?
 *
 * The doc's own answer is that this isn't one rule, it's a vocabulary, and
 * that's what shipped. There is no general heuristic here on purpose: whether
 * a word describes a thing or names a different thing depends entirely on what
 * follows it, and getting it wrong is *invisible* — two rows merge and the
 * list is confidently wrong.
 *
 * So these tests are the vocabulary, written down.
 */

const merges = (a: string, b: string) => normalizeIngredientName(a) === normalizeIngredientName(b);

test('a descriptor that does not change what you buy is dropped', () => {
  // You come home with the same thing either way. Merging these is the whole
  // point of normalizing at all.
  for (const [written, plain] of [
    ['large eggs', 'eggs'],
    ['medium onion', 'onion'],
    ['ripe banana', 'banana'],
    ['cold water', 'water'],
    ['organic milk', 'milk'],
    ['finely chopped parsley', 'parsley'],
    ['freshly grated parmesan', 'parmesan'],
  ] as const) {
    assert.ok(merges(written, plain), `${written} should merge with ${plain}`);
  }
});

test('a modifier that names a different product is kept', () => {
  // Buy the wrong one of these and the dish is wrong. White pepper is not
  // black pepper; smoked paprika is not paprika.
  for (const [written, plain] of [
    ['heavy cream', 'cream'],
    ['black pepper', 'pepper'],
    ['white pepper', 'pepper'],
    ['smoked paprika', 'paprika'],
    ['dark brown sugar', 'brown sugar'],
    ['sweet potato', 'potato'],
    ['red onion', 'onion'],
    ['wild rice', 'rice'],
  ] as const) {
    assert.ok(!merges(written, plain), `${written} should NOT merge with ${plain}`);
  }
});

test('a word that is a descriptor in general can still name a product', () => {
  // The four this item actually fixed. "raw" and "fresh" are ordinary
  // descriptors — "raw shrimp" is shrimp — right up until they aren't.
  for (const [written, plain] of [
    ['raw sugar', 'sugar'],
    ['raw honey', 'honey'],
    ['fresh mozzarella', 'mozzarella'],
    ['fresh pasta', 'pasta'],
    ['fresh yeast', 'yeast'],
  ] as const) {
    assert.ok(!merges(written, plain), `${written} should NOT merge with ${plain}`);
  }
  // And still descriptors everywhere else.
  assert.ok(merges('raw shrimp', 'shrimp'));
  assert.ok(merges('fresh spinach', 'spinach'));
});

test('the protection survives a following word', () => {
  assert.equal(normalizeIngredientName('raw cane sugar'), 'raw cane sugar');
  assert.ok(!merges('fresh mozzarella balls', 'mozzarella balls'));
});

test('no word that separates two products is on a droppable list', () => {
  // The guard that matters most, because adding one of these later would be a
  // one-line change with a silent, wrong result. If a future item wants to
  // drop one of these words, it has to delete it from here first and say why.
  const dropped: string[] = [];
  for (const word of NEVER_DROPPABLE) {
    // A name made of the word plus a head must keep the word.
    if (normalizeIngredientName(`${word} thing`) !== `${word} thing`) dropped.push(word);
  }
  assert.deepEqual(dropped, []);
});

test('two spellings of one product still land on one row', () => {
  // The other half of the job — keeping distinctions must not cost us merges.
  const items = aggregateIngredients([
    parseIngredient('1 cup heavy whipping cream'),
    parseIngredient('1/2 cup double cream'),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].ingredientName, 'heavy cream');
});

test('a kept distinction really is two rows on the list', () => {
  const items = aggregateIngredients([
    parseIngredient('1 tsp black pepper'),
    parseIngredient('1 tsp white pepper'),
  ]);
  assert.equal(items.length, 2);
});
