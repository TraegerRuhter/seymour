import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestCategory,
  suggestMainIngredient,
  suggestMealTypes,
  suggestTags,
} from '../src/lib/auto-tag.ts';

test('breakfast dishes are tagged breakfast, even with a protein in the title', () => {
  assert.deepEqual(suggestMealTypes('Fluffy Buttermilk Pancakes', []), ['breakfast']);
  assert.deepEqual(suggestMealTypes('Bacon and Egg Breakfast Burrito', ['bacon', 'egg']), [
    'breakfast',
  ]);
});

test('unambiguous desserts are tagged dessert', () => {
  assert.deepEqual(suggestMealTypes('No-Churn Vanilla Ice Cream', []), ['dessert']);
  assert.deepEqual(suggestMealTypes('Classic Cheesecake', []), ['dessert']);
});

test('a generic dessert word ("cake", "pie") without a protein is dessert', () => {
  assert.deepEqual(suggestMealTypes('Chocolate Cake', []), ['dessert']);
  assert.deepEqual(suggestMealTypes('Apple Pie', []), ['dessert']);
});

test('a generic dessert word alongside a protein is a savory entrée, not dessert (crab cake, chicken pot pie)', () => {
  assert.deepEqual(suggestMealTypes('Crab Cakes', ['crab', 'breadcrumbs']), ['lunch', 'dinner']);
  assert.deepEqual(suggestMealTypes('Chicken Pot Pie', ['chicken', 'peas']), ['lunch', 'dinner']);
});

test('snack words are tagged snack', () => {
  assert.deepEqual(suggestMealTypes('Spicy Black Bean Dip', []), ['snack']);
});

test('"granola bar" is tagged snack, not shadowed by the more generic "granola"', () => {
  assert.deepEqual(suggestMealTypes('No-Bake Granola Bars', []), ['snack']);
});

test('bare "granola" (no bar/cereal context) is left untagged rather than guessed', () => {
  assert.deepEqual(suggestMealTypes('Homemade Granola', []), []);
});

test('a savory dish with a protein is lunch and dinner', () => {
  assert.deepEqual(
    suggestMealTypes('Weeknight Chicken Curry', ['chicken thighs', 'curry powder']),
    ['lunch', 'dinner'],
  );
  assert.deepEqual(suggestMealTypes('Beef Stew', []), ['lunch', 'dinner']);
});

test('an ambiguous dish with no protein and no keyword signal is left untagged', () => {
  assert.deepEqual(suggestMealTypes('Grandma’s Surprise', []), []);
  assert.deepEqual(suggestMealTypes('Weeknight Delight', []), []);
});

test('suggestCategory prefers a category already used in the collection over the canonical guess', () => {
  assert.equal(suggestCategory('Tomato Soup', [], ['Soups']), 'Soups');
  assert.equal(suggestCategory('Tomato Soup', [], []), 'Soup');
});

test('suggestCategory falls back to undefined when nothing matches', () => {
  assert.equal(suggestCategory('Grandma’s Casserole Surprise', [], []), 'Casserole');
  assert.equal(suggestCategory('Mystery Bowl', [], []), undefined);
});

test('suggestCategory does not call a savory dish "Dessert" just because of "cake"/"pie" (matches suggestMealTypes)', () => {
  assert.equal(suggestCategory('Crab Cakes', ['crab', 'breadcrumbs'], []), undefined);
  assert.equal(suggestCategory('Chicken Pot Pie', ['chicken', 'peas'], []), undefined);
  assert.equal(suggestCategory('Shepherd’s Pie', ['ground lamb', 'peas'], []), undefined);
});

test('suggestCategory still guesses Dessert for "cake"/"pie" with no protein signal', () => {
  assert.equal(suggestCategory('Chocolate Cake', [], []), 'Dessert');
  assert.equal(suggestCategory('Apple Pie', [], []), 'Dessert');
});

test('suggestMainIngredient finds the first protein-ish ingredient in listed order', () => {
  assert.equal(suggestMainIngredient(['2 cups flour', '1 lb ground beef', 'onion']), 'beef');
  assert.equal(suggestMainIngredient(['salt', 'pepper', 'olive oil']), undefined);
});

test('suggestTags combines all three suggestions', () => {
  const result = suggestTags('Weeknight Chicken Curry', ['chicken thighs', 'curry powder'], []);
  assert.deepEqual(result.mealTypes, ['lunch', 'dinner']);
  assert.equal(result.category, 'Curry');
  assert.equal(result.mainIngredient, 'chicken');
});
