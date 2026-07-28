import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reparseAllRecipes } from '../src/lib/actions.ts';
import { useRecipeStore } from '../src/lib/stores.ts';
import type { Ingredient, Recipe } from '../src/lib/types.ts';

/**
 * Parsing happens once, when a recipe is imported or saved, and the result is
 * what the shopping list is built from — so improving the parser does nothing
 * for recipes already in the collection. This is the catch-up.
 *
 * It only works because `originalString` is kept verbatim on every ingredient.
 * These tests are as much about that guarantee as about the function.
 */

function seed(ingredients: Ingredient[]): Recipe {
  const recipe: Recipe = {
    id: 'r1',
    title: 'Chilli',
    sourceUrl: '',
    ingredients,
    instructions: [],
    dateAdded: '2024-01-01T00:00:00.000Z',
  };
  useRecipeStore.getState().replaceAll({ r1: recipe });
  return recipe;
}

const stored = () => useRecipeStore.getState().recipes.r1.ingredients;

test('a recipe stored with an older parse is corrected', () => {
  // Exactly what the previous parser produced for these lines.
  seed([
    { name: 'of tomato', quantity: 2, unit: 'can', originalString: '2 (14 oz) cans of tomatoes' },
    { name: 'salt', quantity: 0, unit: '', originalString: 'salt to taste' },
  ]);

  assert.equal(reparseAllRecipes(), 1);
  assert.equal(stored()[0].name, 'tomato');
  assert.equal(stored()[0].quantity, 2);
  assert.equal(stored()[0].unit, 'can');
  assert.equal(stored()[1].qualifier, 'to taste');
});

test('the original line is never rewritten', () => {
  // The whole thing rests on this: re-reading is only lossless while the raw
  // line is still there to re-read.
  const raw = '2 (14 oz) cans of tomatoes';
  seed([{ name: 'of tomato', quantity: 2, unit: 'can', originalString: raw }]);
  reparseAllRecipes();
  assert.equal(stored()[0].originalString, raw);
});

test('running it twice changes nothing the second time', () => {
  seed([
    { name: 'of tomato', quantity: 2, unit: 'can', originalString: '2 (14 oz) cans of tomatoes' },
  ]);
  assert.equal(reparseAllRecipes(), 1);
  assert.equal(reparseAllRecipes(), 0);
});

test('a collection already parsed by the current version reports no change', () => {
  seed([{ name: 'bread', quantity: 2, unit: 'slice', originalString: '2 slices bread' }]);
  assert.equal(reparseAllRecipes(), 0);
});

test('a recipe that has been through Supabase is not mistaken for a stale one', () => {
  // Postgres jsonb sorts object keys by length then bytewise, so an ingredient
  // that has round-tripped through the server comes back as
  // {name, unit, notes, quantity, …} rather than the order the parser emits.
  // Comparing serialized forms called that a change, so every synced recipe
  // was rewritten and pushed back on every press — with a fresh updatedAt,
  // which under last-write-wins would beat a newer edit from another device.
  const jsonbOrder = JSON.parse(
    '{"name":"bread","unit":"slice","quantity":2,"originalString":"2 slices bread"}',
  ) as Ingredient;
  seed([jsonbOrder]);
  assert.equal(reparseAllRecipes(), 0);
  assert.equal(useRecipeStore.getState().recipes.r1.updatedAt, undefined);
});

test('a recipe with no original line to re-read is left alone', () => {
  // Rewriting a recipe's ingredients from a guess would be a bad way to find
  // out this can happen.
  seed([{ name: 'mystery', quantity: 1, unit: '', originalString: '' }]);
  assert.equal(reparseAllRecipes(), 0);
  assert.equal(stored()[0].name, 'mystery');
});

test('only the recipes that actually change are counted', () => {
  const stale: Recipe = {
    id: 'r1',
    title: 'Chilli',
    sourceUrl: '',
    ingredients: [
      { name: 'of tomato', quantity: 2, unit: 'can', originalString: '2 (14 oz) cans of tomatoes' },
    ],
    instructions: [],
    dateAdded: '2024-01-01T00:00:00.000Z',
  };
  const current: Recipe = {
    id: 'r2',
    title: 'Toast',
    sourceUrl: '',
    ingredients: [{ name: 'bread', quantity: 2, unit: 'slice', originalString: '2 slices bread' }],
    instructions: [],
    dateAdded: '2024-01-01T00:00:00.000Z',
  };
  useRecipeStore.getState().replaceAll({ r1: stale, r2: current });

  assert.equal(reparseAllRecipes(), 1);
  // The untouched one keeps its timestamp absent — it was never rewritten.
  assert.equal(useRecipeStore.getState().recipes.r2.updatedAt, undefined);
  assert.ok(useRecipeStore.getState().recipes.r1.updatedAt);
});
