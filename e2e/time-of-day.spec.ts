import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * The clock is pinned and the timezone fixed to UTC, so "18:00" means 6pm to
 * the browser regardless of where the test runs. Without the timezone the
 * assertions would pass locally and drift on a CI runner in a different one.
 *
 * These assert order and labelling, not appearance. Playwright's clock also
 * stubs requestAnimationFrame, which leaves the dashboard's entrance animation
 * parked at opacity 0 — so a visibility assertion here would be meaningless
 * (`toBeVisible` ignores opacity anyway) and an opacity assertion would fail
 * for reasons that have nothing to do with the app.
 */
test.describe('Time of day', () => {
  test.use({ timezoneId: 'UTC' });

  async function planToday(page: import('@playwright/test').Page) {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
    });
    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();
    await page.goto('/');
    return page.locator('section[aria-label="Today\'s meals"] a');
  }

  test('at dinner time the dashboard leads with dinner, not breakfast', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-07-25T18:00:00Z'));
    const cards = await planToday(page);

    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText('Dinner');
    // The clock backs this up at 6pm, so it may claim to be happening now.
    await expect(cards.first()).toContainText('now');
  });

  test('in the morning the day reads in its normal order', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-07-25T08:00:00Z'));
    const cards = await planToday(page);

    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText('Breakfast');
    await expect(cards.first()).toContainText('now');
  });

  test('mid-afternoon it points at dinner as next rather than claiming it is now', async ({
    page,
  }) => {
    // 3pm is the snack slot and nothing is planned for it, so the lead is the
    // meal that comes after — which is emphatically not happening yet.
    await page.clock.setFixedTime(new Date('2026-07-25T15:30:00Z'));
    const cards = await planToday(page);

    await expect(cards.first()).toContainText('Dinner');
    await expect(cards.first()).toContainText('next');
    await expect(cards.first()).not.toContainText('now');
  });

  test('only the leading meal is labelled', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-07-25T18:00:00Z'));
    const cards = await planToday(page);

    await expect(cards.nth(1)).not.toContainText('now');
    await expect(cards.nth(2)).not.toContainText('now');
  });
});
