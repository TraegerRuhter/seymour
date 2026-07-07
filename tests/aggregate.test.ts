import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateIngredients, mergeShoppingList } from '../src/lib/aggregate.ts';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { formatQuantity, toReadable } from '../src/lib/units.ts';

test('sums same ingredient with same unit', () => {
  const items = aggregateIngredients([
    parseIngredient('1 cup milk'),
    parseIngredient('2 cups milk'),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].ingredientName, 'milk');
  assert.ok(Math.abs(items[0].totalQuantity - 3) < 0.01);
  assert.equal(items[0].unit, 'cup');
});

test('converts tbsp into cups when summing volume', () => {
  const items = aggregateIngredients([
    parseIngredient('8 tbsp butter'),
    parseIngredient('1/2 cup butter'),
  ]);
  assert.equal(items.length, 1);
  // 8 tbsp = 0.5 cup, so total = 1 cup
  assert.equal(items[0].unit, 'cup');
  assert.ok(Math.abs(items[0].totalQuantity - 1) < 0.02);
});

test('normalizes synonyms: yellow onion + onion merge', () => {
  const items = aggregateIngredients([
    parseIngredient('1 yellow onion, diced'),
    parseIngredient('2 onions'),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].ingredientName, 'onion');
  assert.equal(items[0].totalQuantity, 3);
});

test('does not sum unlike units (cloves vs cups)', () => {
  const items = aggregateIngredients([
    parseIngredient('2 cloves garlic'),
    parseIngredient('1 tbsp garlic'),
  ]);
  assert.equal(items.length, 2);
});

test('weight converts to readable pounds', () => {
  const items = aggregateIngredients([
    parseIngredient('500 g ground beef'),
    parseIngredient('300 g ground beef'),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].unit, 'lb');
  assert.ok(Math.abs(items[0].totalQuantity - 800 / 453.592) < 0.01);
});

test('unquantified items appear once without quantity', () => {
  const items = aggregateIngredients([
    parseIngredient('salt to taste'),
    parseIngredient('salt to taste'),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].totalQuantity, 0);
});

test('mergeShoppingList preserves checked state by id', () => {
  const first = aggregateIngredients([parseIngredient('1 cup milk')]);
  first[0].checked = true;
  const next = aggregateIngredients([
    parseIngredient('1 cup milk'),
    parseIngredient('2 eggs'),
  ]);
  const merged = mergeShoppingList(next, first);
  const milk = merged.find((i) => i.ingredientName === 'milk')!;
  const egg = merged.find((i) => i.ingredientName === 'egg')!;
  assert.equal(milk.checked, true);
  assert.equal(egg.checked, false);
});

test('formatQuantity renders friendly fractions', () => {
  assert.equal(formatQuantity(0.5), '½');
  assert.equal(formatQuantity(1.75), '1¾');
  assert.equal(formatQuantity(2), '2');
  assert.equal(formatQuantity(1 / 3), '⅓');
});

test('toReadable picks sensible units', () => {
  // 473 mL ≈ 2 cups
  const vol = toReadable(473.176, 'ml');
  assert.equal(vol.unit, 'cup');
  assert.ok(Math.abs(vol.quantity - 2) < 0.01);
  // 800 g ≈ 1.76 lb
  const wt = toReadable(800, 'g');
  assert.equal(wt.unit, 'lb');
  assert.ok(Math.abs(wt.quantity - 1.76) < 0.01);
});
