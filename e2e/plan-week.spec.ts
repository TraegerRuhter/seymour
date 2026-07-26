import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * The planner used to be a wrapping grid of day-cards, which never read as a
 * week — seven days landed as 3+3+1 in no particular reading order. It's a
 * timetable now: named days in order, one row each.
 */
test.describe('The week', () => {
  async function planSevenDays(page: import('@playwright/test').Page) {
    for (const title of ['Weeknight Chicken Curry', 'Blueberry Pancakes', 'Lentil & Kale Soup']) {
      await addRecipeManually(page, { title, ingredients: ['1 lb chicken thighs'] });
    }
    await page.goto('/plan');
    await page.getByRole('button', { name: '7', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();
    await expect(page.locator('.wk-day')).toHaveCount(7);
  }

  test('seven days read as seven named rows, in order', async ({ page }) => {
    await planSevenDays(page);

    const names = await page.locator('.wk-dayname').allTextContents();
    expect(names).toHaveLength(7);
    expect(names[0]).toBe('Today');
    // Every row is named, and no two rows share a name.
    expect(new Set(names).size).toBe(7);
  });

  test('today is marked, and only today', async ({ page }) => {
    await planSevenDays(page);
    await expect(page.locator('.wk-day[data-today="true"]')).toHaveCount(1);
    await expect(page.locator('.wk-day[data-today="true"] .wk-dayname')).toHaveText('Today');
  });

  test('the plan is not made of cards any more', async ({ page }) => {
    await planSevenDays(page);
    // The rounded panel is the thing every screen used to share; the planner
    // being a timetable is the whole point of this change.
    await expect(page.locator('.week .glass-card')).toHaveCount(0);
  });

  test('a day still stacks its meals in meal order', async ({ page }) => {
    await planSevenDays(page);
    const first = page.locator('.wk-day').first();
    const labels = await first.locator('.wk-meal p').first().textContent();
    expect(labels).toMatch(/breakfast/i);
  });

  test('each meal keeps its controls, on one row', async ({ page }) => {
    await planSevenDays(page);
    const meal = page.locator('.wk-meal').first();
    await expect(meal.getByRole('button', { name: /Shuffle/ })).toHaveCount(1);
    await expect(meal.getByRole('button', { name: /More actions/ })).toHaveCount(1);
    // The servings stepper feeds the shopping list, so it has to survive the
    // move onto the meal's own line.
    await expect(meal.getByRole('button', { name: /Increase|More servings|\+/ })).not.toHaveCount(
      0,
    );
  });
});
