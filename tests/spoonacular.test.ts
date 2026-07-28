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

test('drops a non-http(s) sourceUrl rather than trusting it, falling back to the hosted source', () => {
  const [recipe] = mapSpoonacularResults([
    makeResult({
      sourceUrl: 'javascript:alert(1)',
      spoonacularSourceUrl: 'https://spoonacular.com/recipes/x-1',
    }),
  ]);
  assert.equal(recipe.sourceUrl, 'https://spoonacular.com/recipes/x-1');
});

test('an entirely non-http(s) source (both fields) maps to an empty sourceUrl', () => {
  const [recipe] = mapSpoonacularResults([
    makeResult({ sourceUrl: 'javascript:alert(1)', spoonacularSourceUrl: 'javascript:alert(2)' }),
  ]);
  assert.equal(recipe.sourceUrl, '');
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

/**
 * `fillIngredients=true` has always been set on the search request, but the
 * response type declared only `original` — so every discovered recipe was
 * re-parsed from a string this API had already parsed. These cover using it.
 */

test('takes the API amount and unit rather than re-deriving them', () => {
  const [recipe] = mapSpoonacularResults([
    makeResult({
      extendedIngredients: [
        { original: '1 lb chicken thighs', amount: 1, unit: 'lb', nameClean: 'chicken thighs' },
      ],
    }),
  ]);
  assert.deepEqual(recipe.ingredients, [
    {
      name: 'chicken thigh',
      quantity: 1,
      unit: 'lb',
      originalString: '1 lb chicken thighs',
      parsedBy: 'api',
    },
  ]);
});

test('the raw line is still kept verbatim', () => {
  const [recipe] = mapSpoonacularResults([
    makeResult({
      extendedIngredients: [
        { original: '2 (14 oz) cans of tomatoes', amount: 2, unit: 'cans', nameClean: 'tomatoes' },
      ],
    }),
  ]);
  assert.equal(recipe.ingredients?.[0].originalString, '2 (14 oz) cans of tomatoes');
  assert.equal(recipe.ingredients?.[0].unit, 'can');
});

test('their name still goes through our normalizer', () => {
  // The shopping list buckets by name, so one vocabulary has to win — and it
  // has to be the one a hand-typed recipe goes through too, or their
  // "chicken stock" and our "chicken broth" are two rows for one carton.
  const [recipe] = mapSpoonacularResults([
    makeResult({
      extendedIngredients: [
        { original: '2 cups chicken stock', amount: 2, unit: 'cups', nameClean: 'chicken stock' },
      ],
    }),
  ]);
  assert.equal(recipe.ingredients?.[0].name, 'chicken broth');
});

test('a unit that is not a measurement is dropped, but the ingredient is not', () => {
  // Spoonacular hands back things like "servings" and "small" in the unit
  // field. A bare count is right more often than a unit nothing can compare.
  const [recipe] = mapSpoonacularResults([
    makeResult({
      extendedIngredients: [
        { original: '2 small onions', amount: 2, unit: 'small', name: 'onion' },
      ],
    }),
  ]);
  assert.deepEqual(recipe.ingredients, [
    { name: 'onion', quantity: 2, unit: '', originalString: '2 small onions', parsedBy: 'api' },
  ]);
});

test('a line the API could not parse falls back to our parser, one line at a time', () => {
  // Not all-or-nothing: one unusable ingredient must not cost us the good
  // parse of the others.
  const [recipe] = mapSpoonacularResults([
    makeResult({
      extendedIngredients: [
        { original: '1 lb chicken thighs', amount: 1, unit: 'lb', nameClean: 'chicken thighs' },
        { original: '3 cloves of garlic' },
      ],
    }),
  ]);
  assert.equal(recipe.ingredients?.length, 2);
  assert.equal(recipe.ingredients?.[0].parsedBy, 'api');
  // Ours, because theirs had nothing to offer.
  assert.equal(recipe.ingredients?.[1].parsedBy, undefined);
  assert.equal(recipe.ingredients?.[1].name, 'garlic');
  assert.equal(recipe.ingredients?.[1].quantity, 3);
});

test('ingredientLines and ingredients stay aligned', () => {
  const [recipe] = mapSpoonacularResults([
    makeResult({
      extendedIngredients: [
        { original: '1 lb chicken thighs', amount: 1, unit: 'lb', nameClean: 'chicken thighs' },
        { original: '   ' },
        { original: '2 tbsp curry powder', amount: 2, unit: 'tbsp', nameClean: 'curry powder' },
      ],
    }),
  ]);
  assert.equal(recipe.ingredientLines.length, recipe.ingredients?.length);
  assert.deepEqual(
    recipe.ingredients?.map((i) => i.originalString),
    recipe.ingredientLines,
  );
});
