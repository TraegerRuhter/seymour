import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, parseIngredientLines } from '../src/lib/ingredient-parser.ts';

/**
 * Item 7 of docs/shopping-parser.md — recipe sites put steps in the ingredient
 * array, and "all purpose flour dissolve in 1/4 cup water" is not a thing you
 * can buy.
 *
 * This is the highest-risk item on the list, because getting it wrong deletes
 * something you needed. Most of what follows is therefore about what must
 * *not* be truncated.
 */

const name = (line: string) => parseIngredient(line).name;

test('a step after the ingredient is cut off the name', () => {
  const p = parseIngredient('1 tablespoon of all purpose flour dissolve in 1/4 cup water');
  assert.equal(p.name, 'flour');
  assert.equal(p.quantity, 1);
  assert.equal(p.unit, 'tbsp');
});

test('the cut-off half is kept as a note, not thrown away', () => {
  const p = parseIngredient('1 cup water combine with the cornstarch');
  assert.equal(p.name, 'water');
  assert.equal(p.notes, 'combine with the cornstarch');
});

test('the original line is still there in full', () => {
  const line = '1 cup rice rinse until the water runs clear';
  assert.equal(parseIngredient(line).originalString, line);
});

test('a participle reads as an instruction when it sits mid-line', () => {
  assert.equal(name('2 tbsp cornstarch dissolved in 2 tbsp water'), 'cornstarch');
});

// --- what must survive ------------------------------------------------------

test('a verb at the front of the line is left alone', () => {
  // Nothing before it means nothing to keep. "Preheat oven to 350°F" stays an
  // ugly row rather than becoming an empty one — an ugly row is recoverable
  // and a missing one isn't. The line never was an ingredient; refusing to
  // guess is the honest answer.
  assert.equal(name('Preheat oven to 350 degrees F'), 'preheat oven to 350 degrees f');
});

test('a verb at the end of the line is a noun, and is left alone', () => {
  assert.equal(name('1 box cake mix'), 'cake mix');
  assert.equal(name('1 package pancake mix'), 'pancake mix');
});

test('prep words are descriptors, not instructions', () => {
  // The trap this item is built to avoid. Every one of these is a word that
  // appears in a recipe's instructions too, and cutting at it would take the
  // ingredient with it. normalize.ts owns these; the parser must not.
  for (const [line, expected] of [
    ['1 package frozen chopped spinach', 'frozen chopped spinach'],
    ['1 cup whipping cream', 'whipping cream'],
    ['2 tbsp cooking oil', 'cooking oil'],
    ['2 cups cooked rice', 'cooked rice'],
    ['1 cup ground almonds', 'ground almond'],
    ['1 (14 oz) can sweetened condensed milk', 'sweetened condensed milk'],
    ['1 tablespoon freshly squeezed lemon juice', 'squeezed lemon juice'],
  ] as const) {
    assert.equal(name(line), expected, line);
  }
});

test('a long but genuine ingredient name is not truncated', () => {
  assert.equal(name('1 lb boneless skinless chicken thighs'), 'boneless skinless chicken thigh');
});

test('nothing is ever dropped from the list by this', () => {
  // Truncation only ever shortens a name. The line itself survives, because
  // an ingredient you needed to buy going missing is the failure that matters.
  const lines = [
    '1 tablespoon of all purpose flour dissolve in 1/4 cup water',
    'Preheat oven to 350 degrees F',
    '1 cup rice rinse until the water runs clear',
  ];
  assert.equal(parseIngredientLines(lines).length, lines.length);
});

test('the word that introduced the step is not left on the name', () => {
  // The cut lands at the verb, so the connective before it survived:
  // "olive oil to drizzle on top" came out named "olive oil to", which never
  // merged with plain olive oil.
  assert.equal(name('1 tbsp olive oil to drizzle on top'), 'olive oil');
  assert.equal(name('A pinch of salt to sprinkle on top'), 'salt');
});

test('a verb with no connective after it is naming a product', () => {
  // "simmer sauce" and "sprinkle topping" are things on a shelf. A step says
  // what to do it *to* — "dissolve in", "combine with", "rinse until".
  assert.equal(name('1 jar tikka masala simmer sauce'), 'tikka masala simmer sauce');
  assert.equal(name('2 tbsp chocolate sprinkle topping'), 'chocolate sprinkle topping');
});

test('truncation never shrinks a line out of existence', () => {
  // A line opening with a connective would truncate to that single word, and
  // parseIngredientLines deletes a name that is only a joining word — so the
  // row vanished. Directly contradicts the promise above.
  const lines = ['and combine with the rest of the flour', 'or discard the fat before serving'];
  const parsed = parseIngredientLines(lines);
  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map((i) => i.originalString),
    lines,
  );
});
