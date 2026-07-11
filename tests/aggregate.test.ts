import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateIngredients, mergeShoppingList } from '../src/lib/aggregate.ts';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { formatAmount, formatQuantity, toReadable } from '../src/lib/units.ts';

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

test('combines every garlic phrasing into a single clove total', () => {
  const items = aggregateIngredients([
    parseIngredient('1 garlic'),
    parseIngredient('2 garlic cloves'),
    parseIngredient('3 cloves garlic'),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].ingredientName, 'garlic');
  assert.equal(items[0].unit, 'clove');
  assert.equal(items[0].totalQuantity, 6);
});

test('a head of garlic does not merge into the clove total', () => {
  const items = aggregateIngredients([
    parseIngredient('2 garlic cloves'),
    parseIngredient('1 head garlic'),
  ]);
  assert.equal(items.length, 2);
});

test('weight converts to readable pounds (imperial, rounded up to ¼)', () => {
  const items = aggregateIngredients(
    [parseIngredient('500 g ground beef'), parseIngredient('300 g ground beef')],
    'imperial',
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].unit, 'lb');
  // 800 g = 1.76 lb → rounds up to 2 lb
  assert.equal(items[0].totalQuantity, 2);
});

test('metric system keeps grams and never mixes units', () => {
  const items = aggregateIngredients(
    [parseIngredient('500 g ground beef'), parseIngredient('300 g ground beef')],
    'metric',
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].unit, 'g');
  assert.equal(items[0].totalQuantity, 800);
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

test('toReadable picks sensible imperial units', () => {
  const vol = toReadable(473.176, 'ml', 'imperial'); // 2 cups
  assert.equal(vol.unit, 'cup');
  assert.equal(vol.quantity, 2);
  const wt = toReadable(800, 'g', 'imperial'); // 1.76 lb → 2 lb
  assert.equal(wt.unit, 'lb');
  assert.equal(wt.quantity, 2);
});

test('toReadable rounds up to a tidy amount, never fiddly decimals', () => {
  // metric: 23.3 g → 24 g (the reported "340.19 g" class of problem)
  const g = toReadable(23.3, 'g', 'metric');
  assert.equal(g.unit, 'g');
  assert.equal(g.quantity, 24);
  // metric ≥1 kg switches to kg, rounded up to 0.05
  const kg = toReadable(1763.7, 'g', 'metric');
  assert.equal(kg.unit, 'kg');
  assert.equal(kg.quantity, 1.8);
  // metric volume ≥1 L switches to L
  const l = toReadable(1200, 'ml', 'metric');
  assert.equal(l.unit, 'l');
  assert.ok(l.quantity >= 1.2 && l.quantity <= 1.25);
  // an amount that displayed as "340.19 g" before now reads cleanly
  const oz = toReadable(340.19, 'g', 'imperial');
  assert.equal(oz.unit, 'oz');
  assert.equal(oz.quantity, 12);
});

test('formatAmount: metric plain numbers, imperial fractions', () => {
  assert.equal(formatAmount(24, 'g'), '24');
  assert.equal(formatAmount(1.8, 'kg'), '1.8');
  assert.equal(formatAmount(250, 'ml'), '250');
  assert.equal(formatAmount(1.75, 'lb'), '1¾');
  assert.equal(formatAmount(0.5, 'cup'), '½');
});
