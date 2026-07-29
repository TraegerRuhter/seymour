import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * The correction loop, end to end.
 *
 * The logic is covered in tests/corrections.test.ts; this is the part that
 * only breaks in a browser — that the menu reaches the dialog, that the dialog
 * shows the line the recipe actually wrote, and that the row changes while
 * you're looking at it rather than after a reload.
 *
 * The line being corrected has to be one the parser genuinely still gets
 * wrong. This test used "Salt and pepper to taste" until compound splitting
 * fixed it, at which point the test broke for the right reason and had to move
 * to a line that is still a known gap. Worth knowing if it breaks again: the
 * first thing to check is whether the parser got better.
 */

const GAP = '1 cup sugar plus 2 tbsp butter';
const BAD_NAME = 'sugar plus 2 tbsp butter';

test('correcting a row fixes it, and Settings can undo it', async ({ page }) => {
  await addRecipeManually(page, {
    title: 'Adobo',
    ingredients: [GAP, '2 cups flour'],
    mealTypes: ['Dinner'],
  });

  await page.goto('/plan');
  await page
    .getByRole('button', { name: /Generate/ })
    .first()
    .click();
  await page.waitForTimeout(1200);
  await page.goto('/shopping-list');
  await expect(page.getByText(BAD_NAME)).toBeVisible();

  // Report the row the parser gets wrong.
  await page.getByRole('button', { name: new RegExp(`More actions for ${BAD_NAME}`) }).click();
  await page.getByRole('button', { name: 'This is wrong' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The dialog shows the line the recipe actually wrote.
  await expect(page.getByText(GAP)).toBeVisible();

  await page.getByLabel('Call it').fill('sugar');
  await page.getByRole('button', { name: 'Fix it' }).click();

  // Fixed in place, while you're looking at it.
  await expect(page.getByText(/Fixed in 1 recipe/)).toBeVisible();
  await expect(page.getByText(BAD_NAME)).toHaveCount(0);
  await expect(page.getByText('sugar', { exact: true })).toBeVisible();

  // And it's listed in Settings, where it can be taken back.
  await page.goto('/settings');
  await expect(page.getByText(BAD_NAME)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText(/went back/)).toBeVisible();

  await page.goto('/shopping-list');
  await expect(page.getByText(BAD_NAME)).toBeVisible();
});
