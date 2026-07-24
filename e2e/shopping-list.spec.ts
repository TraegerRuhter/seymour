import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

test.describe('Shopping list', () => {
  test('an empty list points you at the planner', async ({ page }) => {
    await page.goto('/shopping-list');
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
  });

  test('generating a plan populates the list, and checking items off tracks progress', async ({
    page,
  }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs', '2 tbsp curry powder'],
      mealTypes: ['Dinner'],
    });

    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();

    await page.goto('/shopping-list');
    const items = page.locator('li').filter({ has: page.locator('input[type=checkbox]') });
    await expect(items).toHaveCount(2);
    await expect(page.getByText('2 of 2 items left')).toBeVisible();

    await items.first().locator('input[type=checkbox]').check();
    await expect(page.getByText('1 of 2 items left')).toBeVisible();

    await items.nth(1).locator('input[type=checkbox]').check();
    await expect(page.getByText('All done')).toBeVisible();

    await page.getByRole('button', { name: 'Uncheck all' }).click();
    await expect(page.getByText('2 of 2 items left')).toBeVisible();
  });

  test('a pantry staple keeps that ingredient off a freshly generated list', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('Add a pantry staple').fill('curry powder');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('curry powder')).toBeVisible();

    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs', '2 tbsp curry powder'],
      mealTypes: ['Dinner'],
    });

    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();

    await page.goto('/shopping-list');
    // The aggregator singularizes ("chicken thigh"), so match loosely.
    await expect(page.getByText(/chicken thigh/)).toBeVisible();
    await expect(page.getByText(/curry powder/)).toHaveCount(0);
  });
});
