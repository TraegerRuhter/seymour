import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

test.describe('Cook log', () => {
  test.beforeEach(async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Lentil & Kale Soup',
      ingredients: ['1 cup red lentils', '1 bunch kale'],
      mealTypes: ['Dinner'],
    });
  });

  test('a never-cooked recipe shows no tally', async ({ page }) => {
    await expect(page.getByText(/^Made /)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cooked it' })).toBeVisible();
  });

  test('logging a cook records it, and it survives a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Cooked it' }).click();
    await expect(page.getByText(/Made once · Today/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Made once · Today/)).toBeVisible();
  });

  test('cooking twice reads as a count, not a repeat of "once"', async ({ page }) => {
    await page.getByRole('button', { name: 'Cooked it' }).click();
    await page.getByRole('button', { name: 'Cooked it' }).click();
    await expect(page.getByText(/Made 2 times/i)).toBeVisible();
  });

  test('undo removes the cook that was just logged', async ({ page }) => {
    await page.getByRole('button', { name: 'Cooked it' }).click();
    await expect(page.getByText(/Made once/i)).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(/^Made /)).toHaveCount(0);

    // And the removal is persisted, not just hidden.
    await page.reload();
    await expect(page.getByText(/^Made /)).toHaveCount(0);
  });
});
