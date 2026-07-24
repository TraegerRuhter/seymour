import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

test.describe('Settings', () => {
  test('theme choice applies immediately and survives a reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('unit system choice persists', async ({ page }) => {
    await page.goto('/settings');
    const metric = page.getByRole('button', { name: /Metric/ });
    await metric.click();
    await expect(metric).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(page.getByRole('button', { name: /Metric/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('adding and removing a pantry staple', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('Add a pantry staple').fill('olive oil');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('olive oil')).toBeVisible();

    await page.getByRole('button', { name: 'Remove olive oil from the spice rack' }).click();
    await expect(page.getByText('Nothing yet')).toBeVisible();
  });

  test('data summary reflects recipe count, and reset-all clears it', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });

    await page.goto('/settings');
    const summary = page.getByRole('region', { name: 'Data summary' });
    await expect(summary.getByText('1', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Reset all' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(summary.getByText('0', { exact: true })).toHaveCount(3);
    await page.goto('/recipes');
    await expect(page.getByRole('link', { name: /Weeknight Chicken Curry/ })).toHaveCount(0);
  });
});
