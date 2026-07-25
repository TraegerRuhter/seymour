import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * The library's index cards. The interesting assertion is that wear is bound
 * to the cook log rather than being decorative — a card's `data-wear` tier is
 * a render of how many times the recipe was actually made.
 */
test.describe('Recipe library index cards', () => {
  test('a new recipe files as pristine and shows its ingredients', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Lentil & Kale Soup',
      ingredients: ['1 cup red lentils', '1 bunch kale', '2 qt vegetable stock'],
    });

    await page.goto('/recipes');
    const card = page.locator('.index-card').filter({ hasText: 'Lentil & Kale Soup' });
    await expect(card).toHaveAttribute('data-wear', 'pristine');
    await expect(card).toContainText('red lentil');
    await expect(card).toContainText('Never made');
    // Nothing to show wear yet.
    await expect(card.locator('.ic-mark')).toHaveCount(0);
  });

  test('wear escalates through tiers as a recipe is actually cooked', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
    });

    const cookIt = page.getByRole('button', { name: 'Cooked it' });
    const card = () => page.locator('.index-card').filter({ hasText: 'Weeknight Chicken Curry' });

    // 1 cook -> light, and the first mark appears.
    await cookIt.click();
    await page.goto('/recipes');
    await expect(card()).toHaveAttribute('data-wear', 'light');
    await expect(card().locator('.ic-mark')).toHaveCount(1);
    await expect(card()).toContainText('1 ×');

    // 4 cooks -> worn, a second kind of mark joins it.
    await card().click();
    for (let i = 0; i < 3; i++) await cookIt.click();
    await page.goto('/recipes');
    await expect(card()).toHaveAttribute('data-wear', 'worn');
    await expect(card().locator('.ic-mark')).toHaveCount(2);

    // 13 cooks -> loved, and the corner softens.
    await card().click();
    for (let i = 0; i < 9; i++) await cookIt.click();
    await page.goto('/recipes');
    await expect(card()).toHaveAttribute('data-wear', 'loved');
    await expect(card().locator('.ic-corner')).toHaveCount(1);
    await expect(card()).toContainText('13 ×');
  });

  test('the same recipe always wears the same way, rather than reshuffling', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Mushroom Risotto',
      ingredients: ['2 cups arborio rice'],
    });
    await page.getByRole('button', { name: 'Cooked it' }).click();

    await page.goto('/recipes');
    const card = page.locator('.index-card').filter({ hasText: 'Mushroom Risotto' });
    const before = await card.getAttribute('data-variant');

    await page.reload();
    await expect(card).toHaveAttribute('data-variant', before!);
  });

  test('a recipe with no photo still lays out, and one with a photo gets it taped on', async ({
    page,
  }) => {
    await addRecipeManually(page, { title: 'No Photo Here', ingredients: ['1 cup flour'] });
    await page.goto('/recipes');
    const bare = page.locator('.index-card').filter({ hasText: 'No Photo Here' });
    await expect(bare.locator('.ic-photo')).toHaveCount(0);
    // The head keeps its full width when there's no photo to avoid.
    await expect(bare.locator('.ic-head.no-photo')).toHaveCount(1);
  });

  test('the list view shares the same material and shows the tally', async ({ page }) => {
    await addRecipeManually(page, { title: 'Beef Tacos', ingredients: ['1 lb ground beef'] });
    await page.getByRole('button', { name: 'Cooked it' }).click();

    await page.goto('/recipes');
    await page.getByRole('button', { name: /Switch to list view/i }).click();
    const row = page.locator('.index-row').filter({ hasText: 'Beef Tacos' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('1 ×');
  });
});
