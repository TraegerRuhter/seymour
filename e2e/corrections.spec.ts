import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * The correction loop, end to end.
 *
 * The logic is covered in tests/corrections.test.ts; this is the part that
 * only breaks in a browser — that the menu reaches the dialog, that the dialog
 * shows the line the recipe actually wrote, and that the row changes while
 * you're looking at it rather than after a reload.
 */

test('correcting a row fixes it, and Settings can undo it', async ({ page }) => {
  await addRecipeManually(page, {
    title: 'Adobo',
    ingredients: ['Salt and pepper to taste', '1/4 cup catsup', '2 cups flour'],
    mealTypes: ['Dinner'],
  });

  await page.goto('/plan');
  await page
    .getByRole('button', { name: /Generate/ })
    .first()
    .click();
  await page.waitForTimeout(1200);
  await page.goto('/shopping-list');
  await expect(page.getByText('salt and pepper')).toBeVisible();

  // Report the row the parser gets wrong.
  await page.getByRole('button', { name: /More actions for salt and pepper/ }).click();
  await page.getByRole('button', { name: 'This is wrong' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The dialog shows the line the recipe actually wrote.
  await expect(page.getByText('Salt and pepper to taste')).toBeVisible();

  await page.getByLabel('Call it').fill('salt');
  await page.getByRole('button', { name: 'Fix it' }).click();

  // Fixed in place, while you're looking at it.
  await expect(page.getByText(/Fixed in 1 recipe/)).toBeVisible();
  await expect(page.getByText('salt and pepper')).toHaveCount(0);
  await expect(page.getByText('salt', { exact: true })).toBeVisible();

  // And it's listed in Settings, where it can be taken back.
  await page.goto('/settings');
  await expect(page.getByText('salt and pepper')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText(/went back/)).toBeVisible();

  await page.goto('/shopping-list');
  await expect(page.getByText('salt and pepper')).toBeVisible();
});
