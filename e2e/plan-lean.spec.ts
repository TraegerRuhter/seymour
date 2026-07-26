import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

/**
 * Seymour leans when a plan lands — the other half of the prospectus's
 * "reactive motion at thresholds" (§6.10), the chomp being the first.
 *
 * These assert `animation-name` rather than sampling a transform matrix.
 * The name holds for the whole 900ms; an interpolated matrix is whatever the
 * frame happened to be, which is a flake waiting to happen.
 */

async function seedAndOpenPlan(page: import('@playwright/test').Page) {
  await addRecipeManually(page, {
    title: 'Weeknight Chicken Curry',
    ingredients: ['1 lb chicken thighs'],
    mealTypes: ['Dinner'],
  });
  await page.goto('/plan');
}

async function generate(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page
    .getByRole('button', { name: /Generate/ })
    .last()
    .click();
}

const leaning = (page: import('@playwright/test').Page) => page.locator('.sey-leaning');

test('a plan landing makes him lean, leaves and all', async ({ page }) => {
  await seedAndOpenPlan(page);
  await generate(page);

  await expect(leaning(page)).toHaveCount(1);
  const names = await leaning(page)
    .first()
    .evaluate((el) => ({
      root: getComputedStyle(el).animationName,
      leaf: getComputedStyle(el.querySelector('.sey-leaf')!).animationName,
      origin: getComputedStyle(el).transformOrigin,
    }));
  // The fade lives on a separate element on purpose: an element has one
  // `animation`, and two rules setting it don't merge — putting both on the
  // Logo meant the lean never ran while the leaves turned regardless.
  expect(names.root).toBe('sey-lean');
  expect(names.leaf).toBe('sey-leaf-lean');
  // The pot stays planted.
  expect(names.origin.endsWith('36px')).toBe(true);
});

test('a shuffle is not a plan landing', async ({ page }) => {
  await seedAndOpenPlan(page);
  await generate(page);
  await expect(leaning(page)).toHaveCount(0, { timeout: 5000 });

  await page.getByRole('button', { name: 'Shuffle', exact: true }).click();
  // Re-rolling meals reuses the plan config, so nothing lands. A mascot that
  // reacted to every shuffle would be furniture inside a minute.
  await page.waitForTimeout(300);
  await expect(leaning(page)).toHaveCount(0);
});

test('arriving at a plan that already exists is not a landing', async ({ page }) => {
  await seedAndOpenPlan(page);
  await generate(page);
  await expect(leaning(page)).toHaveCount(0, { timeout: 5000 });

  await page.reload();
  await page.waitForTimeout(400);
  await expect(leaning(page)).toHaveCount(0);
});

test('he does not stay — the page keeps no permanent mascot', async ({ page }) => {
  await seedAndOpenPlan(page);
  const slot = page.locator('main header p span[aria-hidden]');
  const boxBefore = await page.locator('main header p').boundingBox();

  await generate(page);
  // Only the departure is asserted here. Waiting to *catch* him on screen
  // races his own 2.3s window — if the week's entry animations push the first
  // poll past it, he has already left and the assertion hangs until it times
  // out. That he appears at all is the first test's job.
  await expect(page.locator('main header p svg')).toHaveCount(0, { timeout: 8000 });

  // The slot keeps its size throughout, so his arrival and departure can't
  // nudge the line of text he sits at the end of.
  await expect(slot).toHaveCount(1);
  const boxAfter = await page.locator('main header p').boundingBox();
  // toBeCloseTo, not toBe: layout heights come back as floats a hair either
  // side of the integer (35.99999237 one run, 36.00000763 the next), so exact
  // equality here fails about half the time on a layout that never moved.
  expect(boxAfter!.height).toBeCloseTo(boxBefore!.height, 1);
});

test('reduced motion gets the moment without the movement', async ({ page }) => {
  await seedAndOpenPlan(page);
  // emulateMedia rather than the `reducedMotion` fixture: the fixture did not
  // take in this setup — the page still reported `no-preference`, which would
  // have made this test pass against an animation that was running anyway.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );

  await generate(page);
  // He still appears; the animation behind him doesn't run.
  await expect(leaning(page)).toHaveCount(1);
  const name = await leaning(page)
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe('none');
});
