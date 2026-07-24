import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

test.describe('Recipe rating', () => {
  test('the hover/keyboard-focus preview clears when focus leaves the star control', async ({
    page,
  }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });

    const group = page.getByRole('group', { name: /Your rating for/ });
    const fills = group.locator('span.overflow-hidden');
    await expect(fills).toHaveCount(5);

    // No rating set yet — every star starts unfilled.
    for (const width of await fills.evaluateAll((els) => els.map((el) => el.style.width))) {
      expect(width).toBe('0%');
    }

    // Focusing "Rate 3 stars" (keyboard path, not a mouse hover) previews a
    // 3-star fill without committing anything.
    await group.getByRole('button', { name: 'Rate 3 stars' }).focus();
    const widthsWhileFocused = await fills.evaluateAll((els) => els.map((el) => el.style.width));
    expect(widthsWhileFocused).toEqual(['100%', '100%', '100%', '0%', '0%']);

    // Moving focus away (nothing was clicked, so no rating was ever set)
    // must clear that preview — StarRating had no onBlur handler, so the
    // 3-star preview used to stick around after focus moved elsewhere.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const widthsAfterBlur = await fills.evaluateAll((els) => els.map((el) => el.style.width));
    for (const width of widthsAfterBlur) {
      expect(width).toBe('0%');
    }
  });
});
