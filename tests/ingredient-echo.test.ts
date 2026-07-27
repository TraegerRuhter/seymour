import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { canonicalUnit, unitSystem, displayUnit } from '../src/lib/units.ts';
import { aggregateIngredients } from '../src/lib/aggregate.ts';

/**
 * Items 5 and 9 of docs/shopping-parser.md — the same amount written twice,
 * and the units a recipe uses when it wasn't written for an American kitchen.
 */

const parsed = (line: string) => {
  const p = parseIngredient(line);
  return { quantity: p.quantity, unit: p.unit, name: p.name };
};

// --- item 5: metric echoes -------------------------------------------------

test('a parenthetical restatement is discarded, as it always was', () => {
  // This half was never broken — the paren branch drops its contents outright.
  // Pinned so item 6 or 7 can't quietly undo it.
  assert.deepEqual(parsed('1 cup (240 ml) milk'), { quantity: 1, unit: 'cup', name: 'milk' });
  assert.deepEqual(parsed('2 lb (900 g) beef'), { quantity: 2, unit: 'lb', name: 'beef' });
  assert.deepEqual(parsed('250g (9oz) plain flour'), { quantity: 250, unit: 'g', name: 'flour' });
});

test('a slash restatement is discarded rather than left in the name', () => {
  // The actual defect: "2 lb / 900 g beef" came out named "/ 900 g beef",
  // which is a shopping row for nothing.
  assert.deepEqual(parsed('2 lb / 900 g beef'), { quantity: 2, unit: 'lb', name: 'beef' });
  assert.deepEqual(parsed('250 g / 9 oz plain flour'), { quantity: 250, unit: 'g', name: 'flour' });
  assert.deepEqual(parsed('1 cup | 240 ml milk'), { quantity: 1, unit: 'cup', name: 'milk' });
});

test('an "or" restatement is discarded too', () => {
  assert.deepEqual(parsed('2 lb or 900 g beef'), { quantity: 2, unit: 'lb', name: 'beef' });
});

test('the first amount is the one kept, not the second', () => {
  // The point of the whole item: one row, one amount. Not 2 lb *and* 900 g.
  const [item] = aggregateIngredients([parseIngredient('2 lb / 900 g beef')]);
  assert.equal(item.ingredientName, 'beef');
  assert.equal(item.totalQuantity, 2);
  assert.equal(item.unit, 'lb');
});

test('a genuine choice between two amounts is left alone', () => {
  // Both sides imperial, so it's an alternative and not a conversion. Item 6
  // owns this line; item 5 must not eat half of it first.
  assert.equal(parsed('1 lb chicken thighs or 2 lb beef').name, 'chicken thighs or 2 lb beef');
});

test('a choice with no amount on the far side is untouched', () => {
  assert.equal(parsed('2 cups milk or cream').name, 'milk or cream');
  assert.equal(parsed('butter or margarine').name, 'butter or margarine');
});

test('"or" does not bite into a word that merely starts with it', () => {
  assert.equal(parsed('1 orange').name, 'orange');
  assert.equal(parsed('2 cups orzo').name, 'orzo');
});

test('a restatement with nothing after it leaves the line as it found it', () => {
  // Eating the echo here would leave no name at all, which is worse.
  assert.notEqual(parsed('2 lb / 900 g').name, '');
});

test('unitSystem tells the two systems apart and abstains on counts', () => {
  assert.equal(unitSystem('lb'), 'imperial');
  assert.equal(unitSystem('cup'), 'imperial');
  assert.equal(unitSystem('kg'), 'metric');
  assert.equal(unitSystem('ml'), 'metric');
  assert.equal(unitSystem('can'), null);
  assert.equal(unitSystem(''), null);
});

// --- item 9: regional and shop-shelf units ---------------------------------

test('kilo is kilograms', () => {
  assert.equal(canonicalUnit('kilo'), 'kg');
  assert.equal(canonicalUnit('kilos'), 'kg');
  assert.deepEqual(parsed('1/2 kilo ground beef'), {
    quantity: 0.5,
    unit: 'kg',
    name: 'ground beef',
  });
});

test('a tin is a can, and a bundle is a bunch', () => {
  // Merging the spellings is the whole reason to add them: two rows for the
  // same tomatoes is the bug.
  assert.equal(canonicalUnit('tin'), 'can');
  assert.equal(canonicalUnit('bundle'), 'bunch');
  assert.equal(canonicalUnit('tali'), 'bunch');
  const items = aggregateIngredients([
    parseIngredient('1 tin chopped tomatoes'),
    parseIngredient('2 cans of tomatoes'),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].totalQuantity, 3);
  assert.equal(items[0].unit, 'can');
});

test('pack, packet and package are one unit', () => {
  assert.equal(canonicalUnit('pack'), 'package');
  assert.equal(canonicalUnit('packs'), 'package');
  assert.equal(canonicalUnit('packet'), 'package');
  assert.equal(canonicalUnit('packets'), 'package');
});

test('a sachet is its own thing, not a package', () => {
  // A sachet is a single-use portion; folding it into "package" would make
  // "3 sachets" and "1 package" the same shopping line, and they aren't.
  assert.equal(canonicalUnit('sachet'), 'sachet');
  assert.deepEqual(parsed('1 sachet tomato sauce'), {
    quantity: 1,
    unit: 'sachet',
    name: 'tomato sauce',
  });
});

test('the shelf units a shop actually sells things in', () => {
  assert.equal(canonicalUnit('bottle'), 'bottle');
  assert.equal(canonicalUnit('bag'), 'bag');
  assert.equal(canonicalUnit('boxes'), 'box');
  assert.equal(canonicalUnit('carton'), 'carton');
  assert.equal(canonicalUnit('dozen'), 'dozen');
  assert.deepEqual(parsed('1 dozen eggs'), { quantity: 1, unit: 'dozen', name: 'egg' });
});

test('every new countable pluralizes sensibly on the list', () => {
  assert.equal(displayUnit('sachet', 3), 'sachets');
  assert.equal(displayUnit('bottle', 2), 'bottles');
  assert.equal(displayUnit('box', 2), 'boxes');
  assert.equal(displayUnit('carton', 2), 'cartons');
  assert.equal(displayUnit('bag', 2), 'bags');
  assert.equal(displayUnit('bag', 1), 'bag');
  // "2 dozen", never "2 dozens".
  assert.equal(displayUnit('dozen', 2), 'dozen');
});

test('the new units do not swallow an ingredient that has no unit', () => {
  // Every alias added is a word the parser will now eat. These are the ones
  // most likely to go wrong.
  assert.equal(parsed('1 orange').name, 'orange');
  assert.equal(parsed('2 bananas').name, 'banana');
  assert.equal(parsed('1 bay leaf').name, 'bay leaf');
});
