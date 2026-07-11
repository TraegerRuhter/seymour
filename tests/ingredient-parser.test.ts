import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';

test('parses "2 cups all-purpose flour"', () => {
  const ing = parseIngredient('2 cups all-purpose flour');
  assert.equal(ing.quantity, 2);
  assert.equal(ing.unit, 'cup');
  assert.equal(ing.name, 'flour');
  assert.equal(ing.originalString, '2 cups all-purpose flour');
});

test('parses mixed number "1 1/2 tbsp olive oil"', () => {
  const ing = parseIngredient('1 1/2 tbsp olive oil');
  assert.equal(ing.quantity, 1.5);
  assert.equal(ing.unit, 'tbsp');
  assert.equal(ing.name, 'olive oil');
});

test('parses glued unicode fraction "1½ cups milk"', () => {
  const ing = parseIngredient('1½ cups milk');
  assert.equal(ing.quantity, 1.5);
  assert.equal(ing.unit, 'cup');
  assert.equal(ing.name, 'milk');
});

test('parses bare unicode fraction "½ tsp salt"', () => {
  const ing = parseIngredient('½ tsp salt');
  assert.equal(ing.quantity, 0.5);
  assert.equal(ing.unit, 'tsp');
  assert.equal(ing.name, 'salt');
});

test('parses range "1-2 cups chicken broth" as average', () => {
  const ing = parseIngredient('1-2 cups chicken broth');
  assert.equal(ing.quantity, 1.5);
  assert.equal(ing.unit, 'cup');
  assert.equal(ing.name, 'chicken broth');
});

test('parses decimal "2.5 kg potatoes"', () => {
  const ing = parseIngredient('2.5 kg potatoes');
  assert.equal(ing.quantity, 2.5);
  assert.equal(ing.unit, 'kg');
  assert.equal(ing.name, 'potato');
});

test('extracts notes after comma', () => {
  const ing = parseIngredient('1 yellow onion, finely diced');
  assert.equal(ing.quantity, 1);
  assert.equal(ing.unit, '');
  assert.equal(ing.name, 'onion');
  assert.equal(ing.notes, 'finely diced');
});

test('strips a leading (comma-less) prep-word adjective: "1 cup chopped onion"', () => {
  const ing = parseIngredient('1 cup chopped onion');
  assert.equal(ing.unit, 'cup');
  assert.equal(ing.name, 'onion');
});

test('"chopped onion" and "minced onion" normalize to the same name', () => {
  const a = parseIngredient('1/2 cup chopped onion');
  const b = parseIngredient('1 cup minced onion');
  assert.equal(a.name, 'onion');
  assert.equal(b.name, 'onion');
});

test('unquantified line keeps quantity 0', () => {
  const ing = parseIngredient('salt to taste');
  assert.equal(ing.quantity, 0);
  assert.equal(ing.name, 'salt');
});

test('handles "of" filler: "2 cups of sugar"', () => {
  const ing = parseIngredient('2 cups of sugar');
  assert.equal(ing.quantity, 2);
  assert.equal(ing.unit, 'cup');
  assert.equal(ing.name, 'sugar');
});

test('non-convertible unit "2 cloves garlic"', () => {
  const ing = parseIngredient('2 cloves garlic');
  assert.equal(ing.quantity, 2);
  assert.equal(ing.unit, 'clove');
  assert.equal(ing.name, 'garlic');
});

test('unit word not present: "3 eggs"', () => {
  const ing = parseIngredient('3 large eggs');
  assert.equal(ing.quantity, 3);
  assert.equal(ing.unit, '');
  assert.equal(ing.name, 'egg');
});

test('parenthetical size: "1 (15 oz) can black beans"', () => {
  const ing = parseIngredient('1 (15 oz) can black beans');
  assert.equal(ing.quantity, 1);
  assert.equal(ing.unit, 'can');
  assert.equal(ing.name, 'black bean');
});

test('trailing unit word: "2 garlic cloves" (unit after the name)', () => {
  const ing = parseIngredient('2 garlic cloves');
  assert.equal(ing.quantity, 2);
  assert.equal(ing.unit, 'clove');
  assert.equal(ing.name, 'garlic');
});

test('bare garlic count defaults to cloves: "1 garlic"', () => {
  const ing = parseIngredient('1 garlic');
  assert.equal(ing.quantity, 1);
  assert.equal(ing.unit, 'clove');
  assert.equal(ing.name, 'garlic');
});

test('a head of garlic stays distinct from cloves: "1 head garlic"', () => {
  const ing = parseIngredient('1 head garlic');
  assert.equal(ing.quantity, 1);
  assert.equal(ing.unit, 'head');
  assert.equal(ing.name, 'garlic');
});

test('trailing unit word elsewhere: "2 butter sticks" matches "1 stick butter"', () => {
  const a = parseIngredient('2 butter sticks');
  const b = parseIngredient('1 stick butter');
  assert.equal(a.unit, 'stick');
  assert.equal(a.name, 'butter');
  assert.deepEqual([a.unit, a.name], [b.unit, b.name]);
});
