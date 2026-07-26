import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * Splitting "2 cups flour" into a name and an amount is the whole change, and
 * it's the kind that can quietly break assistive tech: the visible text is now
 * two spans, so the label has to carry the whole line itself.
 */
test.describe('The ledger', () => {
  async function listWithAmounts(page: import('@playwright/test').Page) {
    await addRecipeManually(page, {
      title: 'Blueberry Pancakes',
      ingredients: ['2 cups all-purpose flour', '1 cup blueberries', '2 eggs'],
    });
    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();
    await page.goto('/shopping-list');
    await expect(page.locator('.ledger-row').first()).toBeVisible();
  }

  // The amounts themselves are whatever the aggregator worked out across the
  // plan, so these assert the *split* rather than the arithmetic — the sums
  // have their own unit tests and hardcoding them here would just make this
  // suite fail whenever the default plan shape changes.
  test('amounts sit in their own column, apart from the name', async ({ page }) => {
    await listWithAmounts(page);

    const flour = page.locator('.ledger-row').filter({ hasText: 'flour' });
    await expect(flour.locator('.ledger-qty')).toHaveText(/^\d+ cups$/);
    // The amount cell holds the amount and nothing else.
    await expect(flour.locator('.ledger-qty')).not.toContainText('flour');
  });

  test('a screen reader still gets the whole line', async ({ page }) => {
    await listWithAmounts(page);

    const flour = page.locator('.ledger-row').filter({ hasText: 'flour' });
    const qty = (await flour.locator('.ledger-qty').textContent())!.trim();
    // The visible text is two spans now, so the label has to say the whole
    // thing itself or the row announces as a bare ingredient with no amount.
    await expect(page.getByLabel(`${qty} flour`)).toHaveCount(1);
  });

  test('an item with no unit is a bare count, not an empty cell', async ({ page }) => {
    await listWithAmounts(page);
    const eggs = page.locator('.ledger-row').filter({ hasText: 'eggs' });
    await expect(eggs.locator('.ledger-qty')).toHaveText(/^\d+$/);
  });

  test('the list is not made of cards any more', async ({ page }) => {
    await listWithAmounts(page);
    await expect(page.locator('.ledger-row.glass-card')).toHaveCount(0);
  });

  test('checking an item off still works, with the bigger tap target', async ({ page }) => {
    await listWithAmounts(page);
    await expect(page.getByText('3 of 3 items left')).toBeVisible();

    // The whole line is the label, so clicking the amount checks it off too.
    await page.locator('.ledger-row').filter({ hasText: 'flour' }).locator('.ledger-qty').click();
    await expect(page.getByText('2 of 3 items left')).toBeVisible();
  });
});
