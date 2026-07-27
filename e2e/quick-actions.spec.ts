import { test, expect } from '@playwright/test';

/**
 * The dashboard's three doors.
 *
 * Discover used to be reachable only by first deciding to add a recipe and
 * then finding a tab, and `?mode=discover` didn't even work — the add page
 * tested for 'manual' and sent everything else to the URL tab. Nothing caught
 * that because nothing linked to it.
 */
test.describe('Quick actions', () => {
  test('all three are whole links, not decorated headings', async ({ page }) => {
    await page.goto('/');
    const actions = page.getByRole('region', { name: 'Quick actions' });
    // The old "Add recipes" card was a div with two links buried in its
    // subtitle, so the big obvious target did nothing at all.
    await expect(actions.getByRole('link')).toHaveCount(3);
  });

  test('Discover goes straight to the Discover tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('region', { name: 'Quick actions' }).getByText('Discover').click();

    await expect(page).toHaveURL(/mode=discover/);
    await expect(page.getByRole('tab', { name: 'Discover' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('the other two land where they say they will', async ({ page }) => {
    await page.goto('/');
    const actions = page.getByRole('region', { name: 'Quick actions' });

    await actions.getByText('Add a recipe').click();
    await expect(page.getByRole('tab', { name: 'From a URL' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.goto('/');
    await actions.getByText(/meal plan/).click();
    await expect(page).toHaveURL(/\/plan$/);
  });

  test('a linked mode that is not a tab falls back rather than breaking', async ({ page }) => {
    await page.goto('/add?mode=nonsense');
    await expect(page.getByRole('tab', { name: 'From a URL' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
