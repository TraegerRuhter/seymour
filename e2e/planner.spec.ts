import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

test.describe('Meal planner', () => {
  test.beforeEach(async ({ page }) => {
    // Untagged so it fits any meal type — keeps plan generation deterministic
    // regardless of which meal types the test selects.
    await addRecipeManually(page, {
      title: 'Pantry Staple Bowl',
      ingredients: ['1 cup rice', '1 can black beans'],
    });
  });

  test('generating a plan renders a day with the selected meal types, in order', async ({
    page,
  }) => {
    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();

    const today = page.getByRole('region', { name: /^Today/ });
    await expect(today).toBeVisible();
    const handles = today.getByRole('button', { name: /Drag to move/ });
    await expect(handles).toHaveCount(3);
    const labels = await handles.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label')),
    );
    expect(labels).toEqual(['Drag to move Breakfast', 'Drag to move Lunch', 'Drag to move Dinner']);
  });

  test('dragging a meal via keyboard reorders it within the day', async ({ page }) => {
    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();

    const today = page.getByRole('region', { name: /^Today/ });
    const handles = today.getByRole('button', { name: /Drag to move/ });
    await expect(handles).toHaveCount(3);

    await today.getByRole('button', { name: 'Drag to move Breakfast' }).focus();
    await page.keyboard.press('Space');
    // dnd-kit measures drop-target rects asynchronously once the drag
    // overlay mounts; waiting for it (rather than pressing immediately)
    // avoids racing that measurement.
    await expect(page.locator('.shadow-card-hover')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    await page.keyboard.press('Space');

    const labels = await handles.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label')),
    );
    expect(labels).toEqual(['Drag to move Lunch', 'Drag to move Breakfast', 'Drag to move Dinner']);
  });

  test('shuffle re-rolls the plan without erroring', async ({ page }) => {
    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();

    await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
    await expect(page.getByRole('region', { name: /^Today/ })).toBeVisible();
  });

  test('adding and removing a meal updates the day', async ({ page }) => {
    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    // The checkbox itself is visually hidden (sr-only) behind its styled
    // label, so a plain click is intercepted by the label — force it.
    await page.getByRole('checkbox', { name: 'Breakfast' }).click({ force: true }); // deselect, leaving Lunch + Dinner
    await page.getByRole('button', { name: 'Generate plan' }).click();

    const today = page.getByRole('region', { name: /^Today/ });
    await expect(today.getByRole('button', { name: /Drag to move/ })).toHaveCount(2);

    await today.getByRole('button', { name: '＋ Add a meal' }).click();
    await today.getByRole('button', { name: 'Snack', exact: true }).click();
    await expect(today.getByRole('button', { name: /Drag to move/ })).toHaveCount(3);
  });

  test('archiving the plan clears the board and lists it under archived plans', async ({
    page,
  }) => {
    await page.goto('/plan');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Generate plan' }).click();
    await expect(page.getByRole('region', { name: /^Today/ })).toBeVisible();

    await page.getByRole('button', { name: /Archive/ }).click();
    await expect(page.getByRole('region', { name: /^Today/ })).toHaveCount(0);

    await page.getByRole('button', { name: /Archived plans/ }).click();
    await expect(page.getByText(/1 day/)).toBeVisible();
  });
});
