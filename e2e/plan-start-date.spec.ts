import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * A plan can start on a day other than today, so next week can be laid out
 * while this one is still running.
 *
 * Asserted relationally rather than against fixed dates — these run on
 * whatever day CI happens to be having, and a test that only passes in July
 * is worse than no test.
 */

async function seed(page: import('@playwright/test').Page) {
  await addRecipeManually(page, {
    title: 'Weeknight Chicken Curry',
    ingredients: ['1 lb chicken thighs'],
    mealTypes: ['Dinner'],
  });
  await page.goto('/plan');
  await page.getByRole('button', { name: '7', exact: true }).click();
}

const generate = (page: import('@playwright/test').Page) =>
  page
    .getByRole('button', { name: /Generate/ })
    .last()
    .click();

test('a plan still starts today unless told otherwise', async ({ page }) => {
  await seed(page);
  await expect(page.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
  await generate(page);

  // Exactly one row is today, and it's the first.
  await expect(page.locator('.wk-day[data-today="true"]')).toHaveCount(1);
  await expect(page.locator('.wk-day').first()).toHaveAttribute('data-today', 'true');
});

test('Next Monday starts the plan on a Monday, in the future', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Next Monday' }).click();
  await generate(page);

  await expect(page.locator('.wk-day')).toHaveCount(7);
  await expect(page.locator('.wk-day .wk-dayname').first()).toHaveText('Monday');
  // Next Monday is never today, so nothing in this plan is.
  await expect(page.locator('.wk-day[data-today="true"]')).toHaveCount(0);
});

test('an arbitrary date is accepted, and the days run consecutively from it', async ({ page }) => {
  await seed(page);
  const input = page.getByLabel('Start date');
  // Far enough out to be unambiguous whatever today is, and across a month
  // boundary on purpose.
  const target = '2030-01-30';
  await input.fill(target);
  await expect(page.getByRole('button', { name: 'Today' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await generate(page);

  const labels = await page
    .locator('.wk-day')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  expect(labels).toHaveLength(7);
  expect(labels[0]).toContain('Wednesday');
  // 30 + 31 Jan, then into February.
  expect(labels[2]).toMatch(/Feb/);
});

test('the span says which week the button is about to make', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Next Monday' }).click();

  const span = page.locator('section[aria-label="Plan configuration"] p').last();
  await expect(span).toContainText('Mon');
  await expect(span).toContainText('–');

  // It tracks the day count too — the two numbers only mean anything together.
  await page.getByRole('button', { name: '1', exact: true }).click();
  await expect(span).not.toContainText('–');
});

test('the picker refuses a date in the past', async ({ page }) => {
  await seed(page);
  // A plan that started last week would sit behind "today" forever, so the
  // input is floored rather than validated after the fact.
  await expect(page.getByLabel('Start date')).toHaveAttribute('min', /^\d{4}-\d{2}-\d{2}$/);
});
