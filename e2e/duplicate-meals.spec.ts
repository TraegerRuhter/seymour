import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * Nothing stops a day holding two dinners — "Add a meal" doesn't dedupe, and
 * shouldn't; cooking two dinners is a real thing to plan for. The dashboard
 * keyed today's meals by meal type, so a second dinner gave React two children
 * with the same key.
 *
 * The e2e suite runs against `next dev`, which is the only build that emits
 * that warning at all — a production build strips it, which is exactly why
 * this went unnoticed.
 */
test('a day with two dinners renders both, without duplicate React keys', async ({ page }) => {
  const reactWarnings: string[] = [];
  page.on('console', (m) => {
    const text = m.text();
    if (/same key|unique/i.test(text)) reactWarnings.push(text.slice(0, 120));
  });

  for (const title of ['Weeknight Chicken Curry', 'Blueberry Pancakes']) {
    await addRecipeManually(page, { title, ingredients: ['1 lb chicken thighs'] });
  }

  await page.goto('/plan');
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: 'Generate plan' }).click();

  // A second dinner, filled — an empty slot is filtered off the dashboard and
  // wouldn't collide with anything.
  await page.getByRole('button', { name: '＋ Add a meal' }).first().click();
  await page.getByRole('button', { name: 'Dinner', exact: true }).click();
  await page.getByRole('button', { name: 'Pick manually' }).first().click();
  await page.getByRole('option').first().click();
  await expect(page.locator('.wk-meal')).toHaveCount(4);

  await page.goto('/');
  const cards = page.locator('section[aria-label="Today\'s meals"] a');
  await expect(cards).toHaveCount(4);

  expect(reactWarnings).toEqual([]);
});
