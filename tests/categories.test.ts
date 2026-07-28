import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize } from '../src/lib/categories.ts';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { CORPUS } from './corpus.ts';

test('produce basics', () => {
  assert.equal(categorize('onion'), 'Produce');
  assert.equal(categorize('cherry tomato'), 'Produce');
  assert.equal(categorize('carrots'), 'Produce');
});

test('specific beats generic: bell pepper is produce, black pepper is spice', () => {
  assert.equal(categorize('bell pepper'), 'Produce');
  assert.equal(categorize('black pepper'), 'Spices & Seasonings');
  assert.equal(categorize('pepper'), 'Spices & Seasonings');
});

test('coconut milk is pantry, milk is dairy', () => {
  assert.equal(categorize('coconut milk'), 'Pantry');
  assert.equal(categorize('milk'), 'Dairy & Eggs');
});

test('meat and seafood', () => {
  assert.equal(categorize('chicken breast'), 'Meat & Seafood');
  assert.equal(categorize('ground beef'), 'Meat & Seafood');
  assert.equal(categorize('shrimp'), 'Meat & Seafood');
});

test('word boundaries: butternut squash is not butter', () => {
  assert.equal(categorize('butternut squash'), 'Produce');
});

test('frozen wins as a marker word', () => {
  assert.equal(categorize('frozen peas'), 'Frozen');
});

test('unknown falls back to Other', () => {
  assert.equal(categorize('xyzzy essence'), 'Other');
});

/**
 * The keyword table met the collection it's actually used on. Filipino and
 * wider South-East Asian ingredients were all landing in "Other", which sorts
 * to the bottom — the wrong end of the shop to find produce at.
 */

test('regional produce reaches the produce section', () => {
  for (const name of [
    'bok choy',
    'pechay',
    'kangkong',
    'calamansi',
    'ampalaya',
    'okra',
    'sitaw',
    'malunggay',
    'kalabasa',
    'sayote',
    'taro',
    'ube',
    'plantain',
    'lemongrass',
  ]) {
    assert.equal(categorize(name), 'Produce', name);
  }
});

test('regional meat reaches the meat counter', () => {
  for (const name of ['bangus', 'longganisa', 'tocino', 'pork belly', 'ground pork']) {
    assert.equal(categorize(name), 'Meat & Seafood', name);
  }
});

test('shelf-stable regional staples reach the pantry', () => {
  for (const name of [
    'catsup',
    'patis',
    'bagoong',
    'tamarind',
    'annatto',
    'bihon',
    'coconut cream',
    'condensed milk',
    'sardine',
  ]) {
    assert.equal(categorize(name), 'Pantry', name);
  }
});

test('the longest keyword still wins', () => {
  // The property the table rests on, now that it has many more overlapping
  // entries: "banana ketchup" is a pantry sauce, not fruit; "condensed milk"
  // is a tin, not dairy.
  assert.equal(categorize('banana ketchup'), 'Pantry');
  assert.equal(categorize('condensed milk'), 'Pantry');
  assert.equal(categorize('evaporated milk'), 'Pantry');
  assert.equal(categorize('coconut cream'), 'Pantry');
  assert.equal(categorize('banana'), 'Produce');
  assert.equal(categorize('milk'), 'Dairy & Eggs');
});

test('almost nothing in the corpus falls through to Other', () => {
  // Was 13%. "Other" is a bin, and a bin that catches an eighth of the list
  // isn't grouping anything.
  const names = [...new Set(CORPUS.map((c) => parseIngredient(c.line).name))];
  const other = names.filter((n) => categorize(n) === 'Other');
  assert.ok(
    other.length <= 2,
    `${other.length} of ${names.length} names uncategorized: ${other.join(', ')}`,
  );
});
