import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * The point of this page is that it's the *same card* as the one in the box,
 * opened up. So the things worth asserting are the ones that would give that
 * away if they drifted: the same stock, the same wear, the same stains.
 */
test.describe('The recipe sheet', () => {
  async function addAndCook(page: import('@playwright/test').Page, times: number) {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs', '2 tbsp curry powder'],
      instructions: ['Brown the chicken.', 'Add everything else.'],
      mealTypes: ['Dinner'],
    });
    for (let i = 0; i < times; i++) {
      await page.getByRole('button', { name: 'Cooked it' }).click();
      await expect(page.getByText(/Made /)).toBeVisible();
      await page.reload();
    }
    return page.url();
  }

  test('the detail page is paper, not a panel', async ({ page }) => {
    await addAndCook(page, 0);
    await expect(page.locator('.recipe-sheet')).toHaveCount(1);
    // The generic panel material must not be doing double duty here.
    await expect(page.locator('.glass-card')).toHaveCount(0);
  });

  test('the sheet wears the same way the card does', async ({ page }) => {
    const url = await addAndCook(page, 5);

    const sheet = await page
      .locator('.recipe-sheet')
      .evaluate((el) => [el.getAttribute('data-wear'), el.getAttribute('data-variant')]);

    await page.goto('/recipes');
    const card = await page
      .locator('.index-card')
      .first()
      .evaluate((el) => [el.getAttribute('data-wear'), el.getAttribute('data-variant')]);

    // Same recipe, same stains — a card that stained one way in the box and
    // another way opened would give the whole conceit away.
    expect(sheet).toEqual(card);

    await page.goto(url);
    await expect(page.locator('.recipe-sheet .ic-mark--ring')).toHaveCount(1);
  });

  test('an uncooked recipe carries no marks at all', async ({ page }) => {
    await addAndCook(page, 0);
    await expect(page.locator('.recipe-sheet')).toHaveAttribute('data-wear', 'pristine');
    await expect(page.locator('.ic-mark')).toHaveCount(0);
  });

  test('the ingredient line survives exactly as it was written', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Charred Broccoli',
      // The prep note is the part a normalised name would throw away.
      ingredients: ['1 head broccoli, cut into spears'],
      mealTypes: ['Dinner'],
    });
    await expect(page.getByText('1 head broccoli, cut into spears')).toBeVisible();
  });

  test('an unfiled recipe shows no eyebrow, not the word "Recipe"', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Charred Broccoli',
      ingredients: ['1 head broccoli'],
      // No category, no meal type.
    });
    const sheet = page.locator('.recipe-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.rs-cat')).toHaveCount(0);
    await expect(sheet).not.toContainText('RECIPE');
  });

  test('the controls stay off the paper, where they can still be read', async ({ page }) => {
    await addAndCook(page, 0);
    const sheet = page.locator('.recipe-sheet');
    // Buttons on a card would be a costume; they live above it.
    await expect(sheet.getByRole('link', { name: 'Start cooking' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Start cooking' })).toBeVisible();
  });
});
