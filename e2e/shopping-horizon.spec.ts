import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * A plan can run further ahead than the shopping list.
 *
 * Asserted on quantities rather than row counts: with one recipe in the
 * collection, a second week adds no new *ingredients*, so the number of rows
 * can't move and a count would pass whatever happened. The amounts are the
 * thing that actually changes.
 */

/** A date well past the end of any plan generated in these tests. */
function farOff(): string {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function planThreeDays(page: import('@playwright/test').Page) {
  await addRecipeManually(page, {
    title: 'Bbq Chicken',
    ingredients: ['1 lb chicken thighs'],
    mealTypes: ['Dinner'],
  });
  await page.goto('/plan');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.locator('section[aria-label="Plan configuration"] button.btn-primary').click();
  await expect(page.locator('.wk-day')).toHaveCount(3);
}

/** Adds a second block starting well after the first, via the date input. */
async function addAWeekLater(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '＋ New plan' }).click();
  await page.getByLabel('Start date').fill(farOff());
  await page.locator('section[aria-label="Plan configuration"] button.btn-primary').click();
}

const notice = (page: import('@playwright/test').Page) =>
  page.getByText(/planned but not on the shopping list/);

test('a block starting after the plan is added to it, not swapped in', async ({ page }) => {
  await planThreeDays(page);
  await addAWeekLater(page);
  await expect(page.locator('.wk-day')).toHaveCount(6);
});

test('the button says whether it will add or replace', async ({ page }) => {
  await planThreeDays(page);
  await page.getByRole('button', { name: '＋ New plan' }).click();
  const button = page.locator('section[aria-label="Plan configuration"] button.btn-primary');

  // Today overlaps the plan that already exists, so it replaces.
  await expect(button).toHaveText(/replace/i);
  await page.getByLabel('Start date').fill(farOff());
  await expect(button).toHaveText('Add to plan');
});

test('the added week does not join the shopping list on its own', async ({ page }) => {
  await planThreeDays(page);
  await page.goto('/shopping-list');
  const qty = page.locator('.ledger-qty').first();
  const before = await qty.innerText();

  await page.goto('/plan');
  await addAWeekLater(page);
  await expect(page.locator('.wk-day')).toHaveCount(6);

  await page.goto('/shopping-list');
  // Same shop as before: twice the meals are planned, none of them bought for.
  await expect(qty).toHaveText(before);
  await expect(notice(page)).toBeVisible();
});

test('adding it to the list is one button, and it changes the amounts', async ({ page }) => {
  await planThreeDays(page);
  await page.goto('/shopping-list');
  const qty = page.locator('.ledger-qty').first();
  const before = await qty.innerText();

  await page.goto('/plan');
  await addAWeekLater(page);
  await page.goto('/shopping-list');
  await page.getByRole('button', { name: 'Add to the list' }).click();

  await expect(qty).not.toHaveText(before);
  // Nothing is left outstanding, so the notice has nothing to say.
  await expect(notice(page)).toHaveCount(0);
});

test('the plan marks the days it is not shopping for', async ({ page }) => {
  await planThreeDays(page);
  await expect(page.locator('.wk-day[data-unshopped="true"]')).toHaveCount(0);

  await addAWeekLater(page);
  // The three days just added, and only those.
  await expect(page.locator('.wk-day[data-unshopped="true"]')).toHaveCount(3);
  await expect(notice(page)).toBeVisible();

  await page.getByRole('button', { name: 'Add to the list' }).click();
  await expect(page.locator('.wk-day[data-unshopped="true"]')).toHaveCount(0);
});

test('a plan on its own is shopped for in full, as it always was', async ({ page }) => {
  await planThreeDays(page);
  await expect(notice(page)).toHaveCount(0);
  await page.goto('/shopping-list');
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator('.ledger-qty').first()).toBeVisible();
});
