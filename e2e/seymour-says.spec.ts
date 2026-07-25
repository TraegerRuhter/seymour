import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * Seymour's dashboard remark. The rules themselves are covered exhaustively
 * in tests/seymour-says.test.ts; this checks the wiring — that a real user
 * action changes what he says, and that he stays quiet when he should.
 */
test.describe('Seymour says', () => {
  test('an empty collection gets asked to be fed', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/the box is empty/i)).toBeVisible();
  });

  test('saving without cooking is noticed, and cooking changes the remark', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Lentil & Kale Soup',
      ingredients: ['1 cup red lentils'],
    });

    await page.goto('/');
    await expect(page.getByText(/saved, but not cooked/i)).toBeVisible();

    // Cook it, and he should have something different to say.
    await page.goto('/recipes');
    await page.locator('.index-card').first().click();
    await page.getByRole('button', { name: 'Cooked it' }).click();

    await page.goto('/');
    await expect(page.getByText(/Lentil & Kale Soup today/i)).toBeVisible();
    await expect(page.getByText(/saved, but not cooked/i)).toHaveCount(0);
  });

  test('the remark replaces the plain recipe count rather than stacking with it', async ({
    page,
  }) => {
    await addRecipeManually(page, { title: 'Toast', ingredients: ['1 slice bread'] });
    await page.goto('/');
    await expect(page.getByText(/saved, but not cooked/i)).toBeVisible();
    await expect(page.getByText(/recipes? in your collection/i)).toHaveCount(0);
  });
});
