import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filedAs } from '../src/lib/filing.ts';

test('a category wins, because it is the thing you chose', () => {
  assert.equal(filedAs({ category: 'Curry', mealTypes: ['breakfast'] }), 'Curry');
});

test('a meal type stands in when there is no category', () => {
  assert.equal(filedAs({ mealTypes: ['dinner'] }), 'Dinner');
});

test('an unfiled recipe is blank, never the word "Recipe"', () => {
  // Regression: the cards were fixed to do this, then the detail page was
  // written later with a 'Recipe' fallback and brought the bug back on a
  // different surface. A box where every uncategorised card says RECIPE tells
  // you nothing.
  assert.equal(filedAs({}), '');
  assert.equal(filedAs({ category: '', mealTypes: [] }), '');
});
