import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';

/**
 * Items 1–3 of docs/shopping-parser.md: filler the parser used to leave
 * behind, lines it couldn't read because they had no number, and the amount
 * it threw away instead of showing.
 */

const parse = (line: string) => {
  const { name, quantity, unit, qualifier } = parseIngredient(line);
  return { name, quantity, unit, qualifier };
};

test('a parenthetical no longer strands the "of" behind it', () => {
  // The confirmed defect: "of" is stripped before the paren branch runs, and
  // that branch then eats "(14 oz) cans" and exposes another one.
  assert.equal(parse('2 (14 oz) cans of tomatoes').name, 'tomato');
  assert.equal(parse('1 (15 oz) can of black beans').name, 'black bean');
  assert.equal(parse('1 (1 tsp) of salt').name, 'salt');
});

test('a parenthetical size is still read as the unit', () => {
  // The behaviour the fix must not break.
  const canned = parse('2 (14 oz) cans tomatoes');
  assert.equal(canned.unit, 'can');
  assert.equal(canned.quantity, 2);
  assert.equal(canned.name, 'tomato');
});

test('an approximator in front of the number does not eat the number', () => {
  assert.deepEqual(parse('about 2 cups flour'), {
    name: 'flour',
    quantity: 2,
    unit: 'cup',
    qualifier: undefined,
  });
  assert.equal(parse('approx. 500 g beef').quantity, 500);
  assert.equal(parse('roughly 3 onions').name, 'onion');
});

test('a unit with no number in front of it means one of them', () => {
  // These used to keep every word, so each formed its own shopping row
  // instead of joining the one for plain salt.
  assert.deepEqual(parse('Pinch of salt'), {
    name: 'salt',
    quantity: 1,
    unit: 'pinch',
    qualifier: undefined,
  });
  assert.deepEqual(parse('Handful of parsley'), {
    name: 'parsley',
    quantity: 1,
    unit: 'handful',
    qualifier: undefined,
  });
  assert.equal(parse('Can of tomatoes').unit, 'can');
  assert.equal(parse('Can of tomatoes').name, 'tomato');
});

test('a leading article is one of something', () => {
  assert.deepEqual(parse('a pinch of salt'), {
    name: 'salt',
    quantity: 1,
    unit: 'pinch',
    qualifier: undefined,
  });
  assert.equal(parse('An onion').quantity, 1);
  assert.equal(parse('An onion').name, 'onion');
});

test('a hedge is stripped but does not invent an amount', () => {
  // "some salt" should bucket with "salt" — but it genuinely doesn't say how
  // much, so it must not claim to.
  const some = parse('some salt');
  assert.equal(some.name, 'salt');
  assert.equal(some.quantity, 0);
  assert.equal(parse('a few sprigs of thyme').name, 'thyme');
});

test('a bare unit word is not mistaken for an ingredient', () => {
  // Nothing would be left to name, so the unit stays part of the name.
  assert.equal(parse('Pinch').name, 'pinch');
  assert.equal(parse('Salt').name, 'salt');
  assert.equal(parse('Salt').quantity, 0);
});

test('an unmeasurable amount is kept rather than dropped', () => {
  assert.equal(parse('salt to taste').qualifier, 'to taste');
  assert.equal(parse('salt to taste').name, 'salt');
  assert.equal(parse('Pepper, to taste').qualifier, 'to taste');
  assert.equal(parse('parsley for garnish').qualifier, 'for garnish');
  assert.equal(parse('oil for frying').qualifier, 'for frying');
  // "or to taste" is "to taste" with a shrug in front of it.
  assert.equal(parse('1/2 tsp chili flakes, or to taste').qualifier, undefined);
  assert.equal(parse('chili flakes, or to taste').qualifier, 'to taste');
});

test('a qualifier is only set when there is no amount to show instead', () => {
  // "2 tbsp oil for frying" has an amount; the qualifier would be noise in
  // the column where the amount goes.
  const measured = parse('2 tbsp oil for frying');
  assert.equal(measured.quantity, 2);
  assert.equal(measured.qualifier, undefined);
});

test('the ordinary forms still parse the way they did', () => {
  // The regression surface for all of the above.
  assert.deepEqual(parse('1 teaspoon of salt'), {
    name: 'salt',
    quantity: 1,
    unit: 'tsp',
    qualifier: undefined,
  });
  assert.deepEqual(parse('3 cloves of garlic'), {
    name: 'garlic',
    quantity: 3,
    unit: 'clove',
    qualifier: undefined,
  });
  assert.equal(parse('2 garlic cloves').unit, 'clove');
  assert.equal(parse('1-2 onions').quantity, 1.5);
  assert.equal(parse('¼ teaspoon of salt').quantity, 0.25);
  assert.equal(parse('2 tbsp worcestershire sauce').name, 'worcestershire sauce');
});
