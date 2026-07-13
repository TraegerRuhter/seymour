import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateIngredients } from '../src/lib/aggregate.ts';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { canonicalUnit } from '../src/lib/units.ts';
import { PRODUCE_YIELDS } from '../src/lib/produce-yields.ts';

test('every produce yield is a positive amount with a recognized piece unit', () => {
  for (const [name, { pieceUnit, mlPerPiece }] of Object.entries(PRODUCE_YIELDS)) {
    assert.ok(mlPerPiece > 0, `${name} has a non-positive yield`);
    if (pieceUnit) {
      assert.equal(
        canonicalUnit(pieceUnit),
        pieceUnit,
        `${name}'s pieceUnit "${pieceUnit}" isn't a unit the parser recognizes`,
      );
    }
  }
});

test('a prepped-volume line converts to a buyable piece count for a bare-count produce item', () => {
  // "1 cup chopped onion" alone (no accompanying whole-count line) should
  // still read as a piece count, not a cup amount.
  const items = aggregateIngredients([parseIngredient('1 cup chopped onion')]);
  assert.equal(items.length, 1);
  assert.equal(items[0].unit, '');
  assert.equal(items[0].totalQuantity, 1);
});

test('volume and whole-count lines for the same produce merge into one piece-count bucket', () => {
  // Celery yields into its natural "stalk" unit rather than a bare count.
  const items = aggregateIngredients([
    parseIngredient('2 stalks celery'),
    parseIngredient('1 cup chopped celery'), // ~2 stalks' worth
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].unit, 'stalk');
  assert.equal(items[0].totalQuantity, 4);
});

test('garlic clove counts and minced-volume amounts merge into one clove total', () => {
  const items = aggregateIngredients([
    parseIngredient('2 cloves garlic'),
    parseIngredient('1 tbsp minced garlic'), // ~3 cloves' worth
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].unit, 'clove');
  assert.equal(items[0].totalQuantity, 5);
});

test('the ingredient parser recognizes "ear(s)" as corn\'s countable unit', () => {
  const parsed = parseIngredient('2 ears corn');
  assert.equal(parsed.quantity, 2);
  assert.equal(parsed.unit, 'ear');
  assert.equal(parsed.name, 'corn');
});

test('weight-based amounts of a produce item are left as weight, not converted to a piece count', () => {
  // Onions are sometimes bought by the pound, not the piece — only volume
  // (cup/tbsp/tsp) amounts convert to a piece count, never weight.
  const items = aggregateIngredients([parseIngredient('2 lb onions')]);
  assert.equal(items.length, 1);
  assert.equal(items[0].unit, 'lb');
  assert.equal(items[0].totalQuantity, 2);
});

test('an ingredient with no known produce yield is unaffected', () => {
  const items = aggregateIngredients([
    parseIngredient('1 cup flour'),
    parseIngredient('2 cups flour'),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].unit, 'cup');
  assert.equal(items[0].totalQuantity, 3);
});
