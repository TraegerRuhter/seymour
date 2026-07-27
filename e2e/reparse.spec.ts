import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * The button that catches an existing collection up with the current parser.
 * The logic is covered in tests/reparse.test.ts; this is the wiring — that
 * pressing it says something true, and that it doesn't offer itself when
 * there's nothing to read.
 */
test.describe('Re-read ingredients', () => {
  test('a freshly-saved collection is already current, and says so', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Chilli',
      ingredients: ['2 (14 oz) cans of tomatoes', 'salt to taste'],
    });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Re-read ingredients' }).click();
    await expect(page.getByText(/Nothing changed/)).toBeVisible();
  });

  test('there is nothing to re-read with no recipes', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Re-read ingredients' })).toBeDisabled();
  });
});
