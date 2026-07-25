import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * The animation itself is CSS and not worth asserting from here. What matters
 * — and what has an off-by-one waiting to happen in it — is *when* the class
 * goes on: on the transition into a finished list, and not on arrival at one
 * that was already finished.
 */
test.describe('The chomp', () => {
  async function listWithTwoItems(page: import('@playwright/test').Page) {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs', '2 tbsp curry powder'],
      mealTypes: ['Dinner'],
    });
    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();
    await page.goto('/shopping-list');
    return page.locator('input[type=checkbox]');
  }

  test('finishing the list makes Seymour bite', async ({ page }) => {
    const boxes = await listWithTwoItems(page);
    const seymour = page.getByRole('img', { name: 'Seymour' }).last();

    // Not there at all while there's still shopping to do.
    await expect(page.locator('.sey-chomping')).toHaveCount(0);

    await boxes.first().check();
    await expect(page.locator('.sey-chomping')).toHaveCount(0);

    await boxes.nth(1).check();
    await expect(seymour).toHaveClass(/sey-chomping/);
  });

  test('and then stops, rather than chewing forever', async ({ page }) => {
    const boxes = await listWithTwoItems(page);
    await boxes.first().check();
    await boxes.nth(1).check();

    await expect(page.locator('.sey-chomping')).toHaveCount(1);
    await expect(page.locator('.sey-chomping')).toHaveCount(0, { timeout: 3000 });
  });

  test('arriving at an already-finished list gets a still mascot', async ({ page }) => {
    const boxes = await listWithTwoItems(page);
    await boxes.first().check();
    await boxes.nth(1).check();
    await expect(page.locator('.sey-chomping')).toHaveCount(0, { timeout: 3000 });

    // The reaction belongs to the thing you just did. Coming back to a list
    // you finished yesterday should not re-enact it.
    await page.reload();
    await expect(page.getByText('All done')).toBeVisible();
    await expect(page.locator('.sey-chomping')).toHaveCount(0);
  });
});
