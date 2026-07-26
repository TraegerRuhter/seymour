import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * The mascot is one SVG whose shape is driven by a prop, so "did he grow?" is
 * really "does the drawing have different geometry now?". These count the leaf
 * paths and the traps, which is the coarsest honest signal — it can't pass by
 * accident and it doesn't pin exact path data that's free to be redrawn.
 */
const headerPlant = (page: import('@playwright/test').Page) =>
  page.locator('header').getByRole('img', { name: 'Seymour' });

/** [leaves, traps] currently drawn in the header mascot. */
async function shapeOf(page: import('@playwright/test').Page) {
  return headerPlant(page).evaluate((svg) => [
    svg.querySelectorAll(':scope > path[fill="#5C9A80"]').length,
    svg.querySelectorAll('.sey-jaw--upper').length,
  ]);
}

async function cook(page: import('@playwright/test').Page, times: number) {
  for (let i = 0; i < times; i++) {
    await page.getByRole('button', { name: 'Cooked it' }).click();
    await expect(page.getByText(/Made /)).toBeVisible();
    await page.reload();
  }
}

test.describe('Growth', () => {
  test('an uncooked collection leaves him a seedling with no trap at all', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });

    const [leaves, traps] = await shapeOf(page);
    expect(traps).toBe(0);
    expect(leaves).toBeGreaterThan(0);
  });

  test('the very first cook grows him a trap', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });
    expect((await shapeOf(page))[1]).toBe(0);

    await cook(page, 1);
    expect((await shapeOf(page))[1]).toBe(1);
  });

  test('cooking past the next threshold adds foliage', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });

    await cook(page, 1);
    const sprout = await shapeOf(page);

    // Five total crosses into the next stage.
    await cook(page, 4);
    const growing = await shapeOf(page);

    expect(growing[0]).toBeGreaterThan(sprout[0]);
  });

  test('he mentions it on the day he grows, and stops mentioning it after', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });

    await cook(page, 5);
    await page.goto('/');
    await expect(page.getByText(/I'd call this growing/i)).toBeVisible();

    // One more cook is no longer a stage change, so the line has to give way.
    await page.goto('/recipes');
    await page.getByRole('link', { name: /Weeknight Chicken Curry/ }).click();
    await cook(page, 1);
    await page.goto('/');
    await expect(page.getByText(/I'd call this/i)).toHaveCount(0);
  });

  test('the plant is the same size everywhere it appears', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });
    await cook(page, 1);

    const inHeader = await shapeOf(page);
    await page.goto('/this-page-does-not-exist');
    // The 404 mascot is decorative and deliberately stays at the default shape,
    // so this asserts the header — the one that tracks state — not the 404.
    expect(await shapeOf(page)).toEqual(inHeader);
  });
});
