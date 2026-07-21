import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapSpoonacularResults, type SpoonacularRecipe } from '../src/lib/spoonacular.ts';

function makeResult(overrides: Partial<SpoonacularRecipe> = {}): SpoonacularRecipe {
  return {
    title: 'Weeknight Chicken Curry',
    image: 'https://example.com/curry.jpg',
    sourceUrl: 'https://cooking.example.com/curry',
    extendedIngredients: [{ original: '1 lb chicken thighs' }, { original: '2 tbsp curry powder' }],
    analyzedInstructions: [
      { steps: [{ step: 'Cook the chicken.' }, { step: 'Add the curry powder.' }] },
    ],
    ...overrides,
  };
}

test('maps a well-formed Spoonacular result onto ParsedRecipeData', () => {
  const [recipe] = mapSpoonacularResults([makeResult()]);
  assert.equal(recipe.title, 'Weeknight Chicken Curry');
  assert.equal(recipe.sourceUrl, 'https://cooking.example.com/curry');
  assert.equal(recipe.imageUrl, 'https://example.com/curry.jpg');
  assert.deepEqual(recipe.ingredientLines, ['1 lb chicken thighs', '2 tbsp curry powder']);
  assert.deepEqual(recipe.instructions, ['Cook the chicken.', 'Add the curry powder.']);
});

test('falls back to the Spoonacular-hosted source when no external sourceUrl is given', () => {
  const [recipe] = mapSpoonacularResults([
    makeResult({
      sourceUrl: undefined,
      spoonacularSourceUrl: 'https://spoonacular.com/recipes/x-1',
    }),
  ]);
  assert.equal(recipe.sourceUrl, 'https://spoonacular.com/recipes/x-1');
});

test('drops a result missing a title', () => {
  const results = mapSpoonacularResults([makeResult({ title: undefined })]);
  assert.equal(results.length, 0);
});

test('drops a result with no usable ingredient lines', () => {
  const results = mapSpoonacularResults([
    makeResult({ extendedIngredients: [] }),
    makeResult({ extendedIngredients: [{ original: '  ' }] }),
  ]);
  assert.equal(results.length, 0);
});

test('a result with no instructions still comes through with an empty instructions list', () => {
  const [recipe] = mapSpoonacularResults([makeResult({ analyzedInstructions: [] })]);
  assert.deepEqual(recipe.instructions, []);
});

test('flattens multiple instruction groups in order', () => {
  const [recipe] = mapSpoonacularResults([
    makeResult({
      analyzedInstructions: [
        { steps: [{ step: 'Prep the marinade.' }] },
        { steps: [{ step: 'Grill the chicken.' }] },
      ],
    }),
  ]);
  assert.deepEqual(recipe.instructions, ['Prep the marinade.', 'Grill the chicken.']);
});

test('maps every result in a batch, skipping only the invalid ones', () => {
  const results = mapSpoonacularResults([
    makeResult({ title: 'Recipe A' }),
    makeResult({ title: undefined }),
    makeResult({ title: 'Recipe B' }),
  ]);
  assert.deepEqual(
    results.map((r) => r.title),
    ['Recipe A', 'Recipe B'],
  );
});
