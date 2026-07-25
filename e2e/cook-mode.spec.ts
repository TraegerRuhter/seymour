import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

const STEPS = [
  'Brown the chicken in a wide pan.',
  'Add the curry powder and cook it out for a minute.',
  'Pour in the coconut milk and simmer twenty minutes.',
];

test.describe('Cook mode', () => {
  async function addCurry(page: import('@playwright/test').Page) {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs', '2 tbsp curry powder'],
      instructions: STEPS,
      mealTypes: ['Dinner'],
    });
  }

  test('walks through one step at a time, forwards and back', async ({ page }) => {
    await addCurry(page);
    await page.getByRole('link', { name: 'Start cooking' }).click();

    await expect(page.getByText('Step 1 of 3')).toBeVisible();
    await expect(page.getByText(STEPS[0])).toBeVisible();
    // One step at a time is the whole point — the others must not be on screen.
    await expect(page.getByText(STEPS[1])).toHaveCount(0);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Step 2 of 3')).toBeVisible();
    await expect(page.getByText(STEPS[1])).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText(STEPS[0])).toBeVisible();
  });

  test('the keyboard moves through the steps, for hands that are busy', async ({ page }) => {
    await addCurry(page);
    await page.goto(`${new URL(page.url()).pathname}/cook`);
    // The key handler is attached in an effect, so wait for the first step to
    // be on screen rather than racing hydration.
    await expect(page.getByText('Step 1 of 3')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Step 2 of 3')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
  });

  test('ingredients are one tap away, because step four never says how much', async ({ page }) => {
    await addCurry(page);
    await page.getByRole('link', { name: 'Start cooking' }).click();

    const panel = page.getByRole('region', { name: 'Ingredients' });
    await expect(panel).toHaveCount(0);

    await page.getByRole('button', { name: 'Ingredients' }).click();
    await expect(panel.getByText(/chicken thighs/)).toBeVisible();
    await expect(panel.getByText(/curry powder/)).toBeVisible();

    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('reaching the end logs the cook, so the tally counts it without being asked', async ({
    page,
  }) => {
    await addCurry(page);
    const recipeUrl = page.url();
    await page.getByRole('link', { name: 'Start cooking' }).click();

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Done' }).click();

    await expect(page.getByText("First time. I'll remember it.")).toBeVisible();

    await page.getByRole('link', { name: 'Back to the recipe' }).click();
    await expect(page).toHaveURL(recipeUrl);
    await expect(page.getByText(/Made once/)).toBeVisible();
  });

  test('a second run through says so, rather than repeating itself', async ({ page }) => {
    await addCurry(page);
    const recipeUrl = page.url();

    for (const expected of [
      "First time. I'll remember it.",
      'Twice now. It must have gone well.',
    ]) {
      await page.goto(recipeUrl);
      await page.getByRole('link', { name: 'Start cooking' }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByText(expected)).toBeVisible();
    }
  });

  test('space activates whatever you have tabbed to, rather than always meaning next', async ({
    page,
  }) => {
    await addCurry(page);
    await page.getByRole('link', { name: 'Start cooking' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Step 2 of 3')).toBeVisible();

    // Claiming space globally sent a keyboard user who had tabbed to "Back"
    // forwards instead.
    await page.getByRole('button', { name: 'Back' }).focus();
    await page.keyboard.press(' ');
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
  });

  test('a recipe with no steps says so instead of opening an empty cook mode', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Charred Broccoli',
      ingredients: ['1 head broccoli'],
      mealTypes: ['Dinner'],
    });
    // No steps, so the entry point should not be offered at all.
    await expect(page.getByRole('link', { name: 'Start cooking' })).toHaveCount(0);

    // And reaching the route directly is handled rather than blank.
    await page.goto(`${new URL(page.url()).pathname}/cook`);
    await expect(page.getByText(/no steps written down/i)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add the steps' })).toBeVisible();
  });
});
