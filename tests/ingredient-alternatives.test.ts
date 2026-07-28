import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { aggregateIngredients } from '../src/lib/aggregate.ts';

/**
 * Item 6 of docs/shopping-parser.md — "butter or margarine" is a single
 * shopping row for a product that doesn't exist.
 *
 * The risk this carries is the opposite of the bug: an ingredient whose real
 * name contains the letters "or" must come through untouched. That's most of
 * what's tested here.
 */

const parsed = (line: string) => {
  const p = parseIngredient(line);
  return { quantity: p.quantity, unit: p.unit, name: p.name, notes: p.notes };
};

test('the first option becomes the name and the rest becomes a note', () => {
  assert.deepEqual(parsed('butter or margarine'), {
    quantity: 0,
    unit: '',
    name: 'butter',
    notes: 'or margarine',
  });
});

test('an amount in front applies to the option that was kept', () => {
  assert.deepEqual(parsed('2 cups milk or cream'), {
    quantity: 2,
    unit: 'cup',
    name: 'milk',
    notes: 'or cream',
  });
});

test('a parenthesised alternative survives the normalizer', () => {
  // normalizeIngredientName drops parentheticals wholesale, so this has to be
  // caught before it runs or the choice disappears silently.
  assert.deepEqual(parsed('cilantro (or parsley)'), {
    quantity: 0,
    unit: '',
    name: 'cilantro',
    notes: 'or parsley',
  });
});

test('an alternative with its own amount keeps that amount out of the name', () => {
  // Item 5 deliberately leaves this alone — same measurement system on both
  // sides, so it's a choice rather than a conversion — which means item 6 is
  // what has to stop "2 lb beef" ending up inside the name.
  assert.deepEqual(parsed('1 lb chicken thighs or 2 lb beef'), {
    quantity: 1,
    unit: 'lb',
    name: 'chicken thigh',
    notes: 'or 2 lb beef',
  });
});

test('a trailing prep note and an alternative both survive', () => {
  assert.deepEqual(parsed('1 onion or 2 shallots, finely diced'), {
    quantity: 1,
    unit: '',
    name: 'onion',
    notes: 'or 2 shallots; finely diced',
  });
});

test('a qualifier still reads off the whole line', () => {
  const p = parseIngredient('salt or pepper to taste');
  assert.equal(p.name, 'salt');
  assert.equal(p.qualifier, 'to taste');
});

// --- the words that must not be touched ------------------------------------

test('an ingredient whose name merely contains "or" is left alone', () => {
  for (const [line, name] of [
    ['1 orange', 'orange'],
    ['2 cups orzo', 'orzo'],
    ['1 tbsp oregano', 'oregano'],
    ['1 cup cornmeal', 'cornmeal'],
    ['chorizo', 'chorizo'],
    ['orange juice', 'orange juice'],
    ['1 tsp coriander', 'coriander'],
  ] as const) {
    const p = parseIngredient(line);
    assert.equal(p.name, name, line);
    assert.equal(p.notes, undefined, `${line} should have no note`);
  }
});

test('"and" is a different problem and is not touched', () => {
  // Two ingredients on one line is its own change, still a known gap.
  assert.equal(parseIngredient('salt and pepper to taste').name, 'salt and pepper');
});

test('a line that is only an alternative marker keeps its name', () => {
  // Nothing before the "or" means nothing to promote — better to leave the
  // line as it was than to produce an empty row.
  assert.ok(parseIngredient('or cream').name);
});

test('two recipes offering the same choice buy one thing', () => {
  // The actual point. Before this, "butter or margarine" and "2 tbsp butter"
  // were two rows.
  const items = aggregateIngredients([
    parseIngredient('butter or margarine'),
    parseIngredient('2 tbsp butter'),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].ingredientName, 'butter');
});
