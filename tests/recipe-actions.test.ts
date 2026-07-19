import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setRecipeNotes, setRecipeRating } from '../src/lib/actions.ts';
import { useRecipeStore } from '../src/lib/stores.ts';
import type { Recipe } from '../src/lib/types.ts';

function seedRecipe(overrides: Partial<Recipe> = {}): Recipe {
  const recipe: Recipe = {
    id: 'r1',
    title: 'Toast',
    sourceUrl: '',
    ingredients: [],
    instructions: [],
    dateAdded: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
  useRecipeStore.getState().replaceAll({ r1: recipe });
  return recipe;
}

test('setRecipeRating sets a whole-star rating', () => {
  seedRecipe();
  setRecipeRating('r1', 4);
  assert.equal(useRecipeStore.getState().recipes.r1.rating, 4);
});

test('setRecipeRating supports half-star precision', () => {
  seedRecipe();
  setRecipeRating('r1', 3.5);
  assert.equal(useRecipeStore.getState().recipes.r1.rating, 3.5);
});

test('setRecipeRating rounds to the nearest half star', () => {
  seedRecipe();
  setRecipeRating('r1', 3.7);
  assert.equal(useRecipeStore.getState().recipes.r1.rating, 3.5);
  setRecipeRating('r1', 3.8);
  assert.equal(useRecipeStore.getState().recipes.r1.rating, 4);
});

test('setRecipeRating clamps to the 0.5–5 range', () => {
  seedRecipe();
  setRecipeRating('r1', 0.2);
  assert.equal(useRecipeStore.getState().recipes.r1.rating, 0.5);
  setRecipeRating('r1', 7);
  assert.equal(useRecipeStore.getState().recipes.r1.rating, 5);
});

test('setRecipeRating(undefined) clears the rating', () => {
  seedRecipe({ rating: 4.5 });
  setRecipeRating('r1', undefined);
  assert.equal(useRecipeStore.getState().recipes.r1.rating, undefined);
});

test('setRecipeRating on a nonexistent recipe is a no-op, not a crash', () => {
  seedRecipe();
  assert.doesNotThrow(() => setRecipeRating('does-not-exist', 3));
});

test('setRecipeNotes sets and trims notes', () => {
  seedRecipe();
  setRecipeNotes('r1', '  Add more garlic next time.  ');
  assert.equal(useRecipeStore.getState().recipes.r1.notes, 'Add more garlic next time.');
});

test('setRecipeNotes with blank text clears notes rather than storing whitespace', () => {
  seedRecipe({ notes: 'old note' });
  setRecipeNotes('r1', '   ');
  assert.equal(useRecipeStore.getState().recipes.r1.notes, undefined);
});

test('setRecipeNotes on a nonexistent recipe is a no-op, not a crash', () => {
  seedRecipe();
  assert.doesNotThrow(() => setRecipeNotes('does-not-exist', 'hello'));
});
