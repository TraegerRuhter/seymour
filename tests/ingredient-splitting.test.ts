import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredientLines } from '../src/lib/ingredient-parser.ts';

/**
 * Two ingredients written on one line, and lines that name nothing at all.
 *
 * Both live in `parseIngredientLines` rather than `parseIngredient`, because
 * both change how many rows come out of one line — which is also why the
 * golden corpus can't express them: every row in that file is one line in, one
 * parse out.
 *
 * Splitting on "and" is far more dangerous than splitting on "or", because
 * plenty of single products have one in the middle. Most of what's below is
 * about the ones that must survive.
 */

const names = (line: string) => parseIngredientLines([line]).map((i) => i.name);

test('two ingredients on one line become two rows', () => {
  assert.deepEqual(names('Salt and pepper to taste'), ['salt', 'pepper']);
  assert.deepEqual(names('oil and vinegar'), ['oil', 'vinegar']);
});

test('each half is normalized in its own right', () => {
  // "sea salt" and "freshly ground black pepper" each resolve through the
  // synonym map, which is the point of re-parsing rather than string-splitting.
  assert.deepEqual(names('Sea salt and freshly ground black pepper'), ['salt', 'black pepper']);
});

test('the qualifier was said about the pair, so both get it', () => {
  const parsed = parseIngredientLines(['Salt and pepper to taste']);
  assert.deepEqual(
    parsed.map((i) => i.qualifier),
    ['to taste', 'to taste'],
  );
});

test('both halves keep the whole original line', () => {
  // They genuinely came from it, and the recipe page shows what was written.
  const line = 'Salt and pepper to taste';
  assert.deepEqual(
    parseIngredientLines([line]).map((i) => i.originalString),
    [line, line],
  );
});

test('a product with "and" in its name is not split', () => {
  // The guard that matters. An amount belongs to one thing, so a line that has
  // one is left alone — and "sweet" isn't a food, so the last of these can't
  // split even without an amount.
  for (const line of [
    '1 box macaroni and cheese',
    '1/2 cup half and half',
    '2 tbsp sweet and sour sauce',
    '1 lb chicken and rice',
  ]) {
    assert.equal(parseIngredientLines([line]).length, 1, line);
  }
});

test('three things on one line are left alone', () => {
  // Two halves is a shape we can reason about; a list is item 7's problem.
  assert.equal(parseIngredientLines(['salt and pepper and parsley']).length, 1);
});

// --- lines that name nothing ------------------------------------------------

test('a line that is only an amount is dropped', () => {
  // parseIngredient never returns an empty name — it falls back to the whole
  // line — so these came out named after their own measurement.
  for (const line of ['1 teaspoon', '2 teaspoons', '3 tbsp', '1 cup', '2']) {
    assert.deepEqual(parseIngredientLines([line]), [], line);
  }
});

test('a number that is part of a name is not mistaken for an amount', () => {
  assert.deepEqual(names('chinese 5 spice'), ['chinese 5 spice']);
  assert.deepEqual(names('2 cups flour'), ['flour']);
  assert.deepEqual(names('1 bay leaf'), ['bay leaf']);
});

test('a stray joining word is still dropped', () => {
  assert.deepEqual(parseIngredientLines(['of', 'or', 'the']), []);
});
