import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addRecipeManually } from './helpers';

/**
 * An automated accessibility pass over every surface, at WCAG 2.1 AA.
 *
 * This exists because a manual audit found 116 contrast violations across
 * eight screens — every one of them secondary text dimmed with an alpha
 * (`text-charcoal/40`, `/50`, `/60`) rather than a token. `tests/palette.test`
 * checks the tokens and could never have caught it, because none of those
 * values are tokens.
 *
 * Axe catches roughly a third of real accessibility problems and none of the
 * judgement calls, so a green run here is a floor rather than a certificate.
 * It is, however, a floor that can't quietly rot.
 */

/** Seeds enough data that no page under test is an empty state. */
async function seed(page: import('@playwright/test').Page) {
  for (const [title, ingredients, instructions] of [
    ['Weeknight Chicken Curry', ['2 lb chicken thighs', '2 tbsp curry powder'], ['Brown it.']],
    ['Blueberry Pancakes', ['2 cups flour', '2 eggs'], ['Whisk.', 'Fry.']],
  ] as const) {
    await addRecipeManually(page, {
      title,
      ingredients: [...ingredients],
      instructions: [...instructions],
      mealTypes: ['Dinner'],
    });
  }
  const detail = page.url();
  await page.getByRole('button', { name: 'Cooked it' }).click();
  await page.goto('/plan');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.getByRole('button', { name: 'Generate plan' }).click();
  return detail;
}

async function violationsOn(page: import('@playwright/test').Page, url: string) {
  await page.goto(url);
  // The pages animate in; auditing mid-fade measures the animation, not the UI.
  await page.waitForTimeout(700);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`);
}

test.describe('Accessibility', () => {
  // Axe injects and runs a full ruleset per page, and these walk eight of them
  // after seeding. Comfortably past the 30s default; slow() gives 90s.
  test.slow();

  test('every surface passes WCAG 2.1 AA', async ({ page }) => {
    const detail = await seed(page);

    const surfaces: Array<[string, string]> = [
      ['dashboard', '/'],
      ['recipe library', '/recipes'],
      ['recipe sheet', detail],
      ['cook mode', `${detail}/cook`],
      ['the week', '/plan'],
      ['the ledger', '/shopping-list'],
      ['settings', '/settings'],
      ['add a recipe', '/add?mode=manual'],
    ];

    const failures: string[] = [];
    for (const [name, url] of surfaces) {
      for (const v of await violationsOn(page, url)) failures.push(`${name}: ${v}`);
    }
    expect(failures).toEqual([]);
  });

  test('the dark theme passes too, since it swaps every colour', async ({ page }) => {
    const detail = await seed(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Dark', exact: true }).click();

    const failures: string[] = [];
    for (const [name, url] of [
      ['dashboard', '/'],
      ['recipe sheet', detail],
      ['the week', '/plan'],
      ['the ledger', '/shopping-list'],
    ] as Array<[string, string]>) {
      for (const v of await violationsOn(page, url)) failures.push(`dark ${name}: ${v}`);
    }
    expect(failures).toEqual([]);
  });
});
