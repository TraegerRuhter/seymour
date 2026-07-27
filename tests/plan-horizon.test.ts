import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBeyondHorizon, daysWithinHorizon } from '../src/lib/plan.ts';
import { appendOrReplace } from '../src/lib/actions.ts';
import type { MealPlanConfig, MealPlanDay } from '../src/lib/types.ts';

/**
 * A plan can run further ahead than the shopping list. Generating next week
 * adds it to the plan and leaves the list alone until you say otherwise —
 * otherwise laying out next week silently doubles the list you're standing in
 * a shop holding.
 */

const day = (date: string): MealPlanDay => ({
  date,
  meals: [{ type: 'dinner', recipeId: 'r1', id: `slot-${date}` }],
});

const week = (dates: string[]) => dates.map(day);

const cfg = (over: Partial<MealPlanConfig> = {}): MealPlanConfig => ({
  days: 2,
  mealTypes: ['dinner'],
  seed: 1,
  ...over,
});

test('the horizon splits the plan in two, and the halves are the whole plan', () => {
  const plan = week(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']);
  const within = daysWithinHorizon(plan, '2026-08-02');
  const beyond = daysBeyondHorizon(plan, '2026-08-02');

  assert.deepEqual(
    within.map((d) => d.date),
    ['2026-08-01', '2026-08-02'],
  );
  assert.deepEqual(
    beyond.map((d) => d.date),
    ['2026-08-03', '2026-08-04'],
  );
  assert.equal(within.length + beyond.length, plan.length);
});

test('the horizon day itself is shopped for', () => {
  // "Through Sunday" includes Sunday. Off by one here means arriving at the
  // shop without dinner.
  const plan = week(['2026-08-01', '2026-08-02']);
  assert.equal(daysWithinHorizon(plan, '2026-08-02').length, 2);
  assert.equal(daysBeyondHorizon(plan, '2026-08-02').length, 0);
});

test('no horizon means the whole plan, as it did before horizons existed', () => {
  const plan = week(['2026-08-01', '2026-08-02']);
  assert.equal(daysWithinHorizon(plan, undefined).length, 2);
  assert.equal(daysBeyondHorizon(plan, undefined).length, 0);
});

test('a block starting after the plan ends is added, not swapped in', () => {
  const existing = week(['2026-08-01', '2026-08-02']);
  const block = week(['2026-08-03', '2026-08-04']);
  const { plan, config } = appendOrReplace(
    existing,
    cfg({ startDate: '2026-08-01', shoppingThrough: '2026-08-02' }),
    block,
    cfg({ startDate: '2026-08-03' }),
  );

  assert.deepEqual(
    plan.map((d) => d.date),
    ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'],
  );
  // The whole point: the new week is planned but not shopped for.
  assert.equal(config.shoppingThrough, '2026-08-02');
  // The config keeps describing the plan, not the block just added to it.
  assert.equal(config.startDate, '2026-08-01');
});

test('an overlapping block replaces, because two meals cannot share one date', () => {
  const existing = week(['2026-08-01', '2026-08-02', '2026-08-03']);
  const block = week(['2026-08-02', '2026-08-03']);
  const { plan, config } = appendOrReplace(
    existing,
    cfg({ shoppingThrough: '2026-08-03' }),
    block,
    cfg({ startDate: '2026-08-02' }),
  );

  assert.deepEqual(
    plan.map((d) => d.date),
    ['2026-08-02', '2026-08-03'],
  );
  assert.equal(config.startDate, '2026-08-02');
  // A replacement is shopped for in full, which is what generating always did.
  assert.equal(config.shoppingThrough, '2026-08-03');
});

test('a block starting on the plan’s last day replaces rather than appends', () => {
  // The boundary: strictly after, not on. Appending here would put two of the
  // 2nd in the plan.
  const existing = week(['2026-08-01', '2026-08-02']);
  const block = week(['2026-08-02', '2026-08-03']);
  const { plan } = appendOrReplace(existing, cfg(), block, cfg());
  assert.deepEqual(
    plan.map((d) => d.date),
    ['2026-08-02', '2026-08-03'],
  );
});

test('appending to a plan that predates horizons pins the horizon where it ended', () => {
  // Without this the old plan's absent horizon means "shop everything", and
  // the week just added would land on the list immediately — the exact thing
  // this feature exists to prevent.
  const existing = week(['2026-08-01', '2026-08-02']);
  const block = week(['2026-08-03']);
  const { config } = appendOrReplace(existing, cfg({ shoppingThrough: undefined }), block, cfg());
  assert.equal(config.shoppingThrough, '2026-08-02');
});

test('the first plan of all is shopped for in full', () => {
  const block = week(['2026-08-01', '2026-08-02']);
  const { plan, config } = appendOrReplace(null, null, block, cfg({ startDate: '2026-08-01' }));
  assert.equal(plan.length, 2);
  assert.equal(config.shoppingThrough, '2026-08-02');
});

test('a gap between the plan and the new block is allowed', () => {
  // Planning a week and skipping the one after it is a legitimate thing to
  // want; days are dated, not positional.
  const existing = week(['2026-08-01']);
  const block = week(['2026-08-10', '2026-08-11']);
  const { plan } = appendOrReplace(existing, cfg({ shoppingThrough: '2026-08-01' }), block, cfg());
  assert.deepEqual(
    plan.map((d) => d.date),
    ['2026-08-01', '2026-08-10', '2026-08-11'],
  );
});
