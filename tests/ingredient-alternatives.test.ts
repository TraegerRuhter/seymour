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

/**
 * Two alternations can have identical shape and opposite right answers:
 *
 *     "butter or olive oil"     — two things, keep "butter"
 *     "olive or vegetable oil"  — one thing twice, keep "olive oil"
 *
 * Splitting at the first " or " unconditionally named the second one "olive",
 * which then categorized as olives. There is no structural rule that separates
 * these, so `chooseOption` asks a vocabulary and stays silent when unsure.
 */

test('a shared head noun is carried onto the option that was kept', () => {
  for (const [line, expected] of [
    ['1 cup vegetable or chicken broth', 'vegetable broth'],
    ['2 tbsp olive or vegetable oil', 'olive oil'],
    ['black or white pepper', 'black pepper'],
    ['1 cup red or white wine', 'red wine'],
    // Both of these resolve further through the synonym map, which is the
    // point — they reach a real product rather than a bare adjective.
    ['1/2 tsp kosher or sea salt', 'salt'],
    ['1 cup white or brown sugar', 'sugar'],
    ['1 lb salted or unsalted butter', 'butter'],
  ] as const) {
    assert.equal(parseIngredient(line).name, expected, line);
  }
});

test('a standalone ingredient beats a shared head', () => {
  // "butter oil" is not a product, so this is two choices and butter wins.
  assert.equal(parseIngredient('butter or olive oil').name, 'butter');
  assert.equal(parseIngredient('1 cup milk or heavy cream').name, 'milk');
});

test('an ambiguous alternation keeps the whole phrase rather than guessing', () => {
  // "water" isn't in the lexicon and "water broth" isn't a thing, so neither
  // reading is safe. A long name is honest; a row called "water" or "chicken"
  // would not be. This is the deliberate no-op case.
  assert.equal(parseIngredient('1 cup water or chicken broth').name, 'water or chicken broth');
});

test('declining to split never leaves a fragment at the front', () => {
  // The trap in the no-op case: normalize strips leading descriptors, so
  // keeping "fresh or frozen blueberries" whole risked "or frozen blueberry".
  for (const line of [
    'fresh or frozen blueberries',
    'dried or fresh thyme',
    'raw or cooked beet',
  ]) {
    assert.doesNotMatch(parseIngredient(line).name, /^(?:of|a|an|and|or|to|for|with)\b/, line);
  }
});

test('every option that was not kept is recorded, not just the first', () => {
  // "butter (or margarine) or ghee" used to lose the ghee entirely — it came
  // out of the name and went nowhere.
  assert.equal(parseIngredient('butter (or margarine) or ghee').notes, 'or margarine or ghee');
  assert.equal(parseIngredient('1 lb beef (or lamb) or chicken').notes, 'or lamb or chicken');
});
