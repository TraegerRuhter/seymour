import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/** The stack a rendered element actually resolved to, lowercased. */
async function familyOf(page: import('@playwright/test').Page, selector: string) {
  return (
    await page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily)
  ).toLowerCase();
}

test.describe('Typography', () => {
  test('each of the three faces is wired to the elements it is meant to carry', async ({
    page,
  }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });
    await page.goto('/recipes');

    // next/font mangles the family name (Fraunces -> __Fraunces_a1b2c3), so
    // these match on the substring rather than the whole declared stack.
    expect(await familyOf(page, 'h1')).toContain('fraunces');
    expect(await familyOf(page, 'body')).toContain('karla');
    expect(await familyOf(page, '.ic-tally')).toContain('courier');
  });

  test('a title long enough to wrap still clears the margin rule', async ({ page }) => {
    // The header is a fixed-height ruled zone with the red margin rule pinned
    // to its bottom edge. A two-line title used to run straight through it.
    await addRecipeManually(page, {
      title: 'Charred Broccoli and Anchovy with Chilli and Toasted Breadcrumbs',
      ingredients: ['1 head broccoli'],
      mealTypes: ['Dinner'],
    });
    await page.goto('/recipes');

    const geometry = await page
      .locator('.index-card')
      .first()
      .evaluate((card) => {
        const top = card.getBoundingClientRect().top;
        const title = card.querySelector('.ic-title')!.getBoundingClientRect();
        const headH = parseFloat(getComputedStyle(card).getPropertyValue('--ic-head-h')) * 16;
        return { titleLines: title.height, titleBottom: title.bottom - top, rule: headH };
      });

    // Two lines at ~1.15 line-height on a ~17px face is comfortably over 30px.
    expect(geometry.titleLines).toBeGreaterThan(30);
    expect(geometry.titleBottom).toBeLessThan(geometry.rule);
  });

  test('ingredient rows sit on the ruled lines rather than drifting between them', async ({
    page,
  }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs', '2 tbsp curry powder', '1 cup coconut milk'],
      mealTypes: ['Dinner'],
    });
    await page.goto('/recipes');

    const drift = await page
      .locator('.index-card')
      .first()
      .evaluate((card) => {
        const cardTop = card.getBoundingClientRect().top;
        const headH = parseFloat(getComputedStyle(card).getPropertyValue('--ic-head-h')) * 16;
        return [...card.querySelectorAll('.ic-ing li .n')].map((n, i) => {
          // A zero-size inline-block aligns to its parent's baseline, which is
          // the only way to read a real baseline position from the DOM.
          const probe = document.createElement('span');
          probe.style.cssText = 'display:inline-block;width:0;height:0';
          n.appendChild(probe);
          const baseline = probe.getBoundingClientRect().top - cardTop;
          probe.remove();
          // The ruling repeats every 26px from the header's bottom edge, with
          // the line itself painted across the last pixel of each band.
          return baseline - (headH + 25 + 26 * i);
        });
      });

    expect(drift).toHaveLength(3);
    for (const d of drift) expect(Math.abs(d)).toBeLessThan(2);
  });
});
