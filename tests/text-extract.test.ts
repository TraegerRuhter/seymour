import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRecipeFromText } from '../src/lib/text-extract.ts';

test('extracts a clean, simple paste', () => {
  const result = extractRecipeFromText(
    'Weeknight Chicken Curry\n' +
      'Ingredients\n' +
      '2 chicken breasts\n' +
      '1 onion, diced\n' +
      '2 tbsp curry powder\n' +
      'Instructions\n' +
      '1. Sauté the onion.\n' +
      '2. Add the chicken and curry powder.\n' +
      '3. Simmer until cooked through.',
  );
  assert.ok(result);
  assert.equal(result!.title, 'Weeknight Chicken Curry');
  assert.deepEqual(result!.ingredientLines, ['2 chicken breasts', '1 onion, diced', '2 tbsp curry powder']);
  assert.deepEqual(result!.instructions, [
    'Sauté the onion.',
    'Add the chicken and curry powder.',
    'Simmer until cooked through.',
  ]);
});

test('handles a messy real-world page dump: nav, ratings, and trailing comments', () => {
  const messy = [
    'Skip to content',
    'Menu',
    'Home',
    'Recipes',
    'Best Ever Banana Bread',
    'Jump to Recipe',
    'Print Recipe',
    '★★★★★ 4.9 from 212 votes',
    'Prep Time: 10 minutes',
    'Cook Time: 55 minutes',
    'This banana bread has been my go-to for years, ever since my grandmother gave me the recipe.',
    'Ingredients',
    '3 ripe bananas, mashed',
    '⅓ cup melted butter',
    '1 tsp baking soda',
    '¾ cup sugar',
    '1 egg, beaten',
    '1½ cups flour',
    'Instructions',
    '1. Preheat oven to 350°F and grease a loaf pan.',
    '2. Mix mashed bananas with melted butter.',
    '3. Stir in baking soda, sugar, egg, and flour.',
    '4. Pour into the pan and bake for 55 minutes.',
    'Notes',
    'Store leftovers wrapped at room temperature for up to 3 days.',
    'Nutrition',
    'Calories: 210, Fat: 6g',
    'Comments',
    'Sarah says: I made this twice this week, amazing!',
  ].join('\n');

  const result = extractRecipeFromText(messy);
  assert.ok(result);
  assert.equal(result!.title, 'Best Ever Banana Bread');
  assert.equal(result!.ingredientLines.length, 6);
  assert.ok(!result!.ingredientLines.some((l) => /jump to recipe|print/i.test(l)));
  assert.equal(result!.instructions.length, 4);
  assert.equal(result!.instructions[0], 'Preheat oven to 350°F and grease a loaf pan.');
  // Notes/Nutrition/Comments must not leak into instructions.
  assert.ok(!result!.instructions.some((l) => /calories|leftovers|amazing/i.test(l)));
});

test('is case-insensitive on section headings', () => {
  const result = extractRecipeFromText('Toast\nINGREDIENTS\nBread\nDirections:\nToast the bread.');
  assert.ok(result);
  assert.deepEqual(result!.ingredientLines, ['Bread']);
  assert.deepEqual(result!.instructions, ['Toast the bread.']);
});

test('strips leading step numbers from instructions', () => {
  const result = extractRecipeFromText('Eggs\nIngredients\n2 eggs\nInstructions\nStep 1: Crack the eggs.\n2) Whisk them.');
  assert.ok(result);
  assert.deepEqual(result!.instructions, ['Crack the eggs.', 'Whisk them.']);
});

test('returns null when no recognizable sections exist', () => {
  const result = extractRecipeFromText('Just a random paragraph about the weather today, nothing recipe-related.');
  assert.equal(result, null);
});

test('returns null for empty or whitespace-only input', () => {
  assert.equal(extractRecipeFromText(''), null);
  assert.equal(extractRecipeFromText('   \n  \n  '), null);
});

test('handles an ingredients-only paste (no instructions heading)', () => {
  const result = extractRecipeFromText('Simple Salad\nIngredients\nLettuce\nTomato\nCucumber');
  assert.ok(result);
  assert.equal(result!.title, 'Simple Salad');
  assert.deepEqual(result!.ingredientLines, ['Lettuce', 'Tomato', 'Cucumber']);
  assert.deepEqual(result!.instructions, []);
});

test('falls back to "Untitled recipe" when no title-like line precedes the heading', () => {
  const result = extractRecipeFromText('Ingredients\n1 egg\nInstructions\nBoil it.');
  assert.ok(result);
  assert.equal(result!.title, 'Untitled recipe');
});
