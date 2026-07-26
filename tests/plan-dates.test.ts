import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  fromLocalDateString,
  generateMealPlan,
  nextMonday,
  toLocalDateString,
} from '../src/lib/plan.ts';
import type { MealPlanConfig } from '../src/lib/types.ts';

/**
 * A plan can start on a day other than today, so you can lay out next week
 * while this one is still running. All of this is calendar arithmetic in local
 * time, which is the kind of thing that looks obviously right and is off by a
 * day in half the world.
 */

test('a local date string survives a round trip', () => {
  const d = new Date(2026, 6, 26, 13, 45);
  assert.equal(toLocalDateString(d), '2026-07-26');
  const back = fromLocalDateString('2026-07-26');
  assert.equal(back.getFullYear(), 2026);
  assert.equal(back.getMonth(), 6);
  assert.equal(back.getDate(), 26);
});

test('parsing is local, not UTC', () => {
  // `new Date('2026-07-26')` is UTC midnight, which is 26 July only if you're
  // east of Greenwich. Anywhere in the Americas it's the 25th, which would
  // silently shift every plan back a day.
  assert.equal(fromLocalDateString('2026-07-26').getDate(), 26);
  assert.equal(fromLocalDateString('2026-07-26').getHours(), 0);
});

test('addDays crosses month and year ends', () => {
  assert.equal(toLocalDateString(addDays(new Date(2026, 6, 30), 3)), '2026-08-02');
  assert.equal(toLocalDateString(addDays(new Date(2026, 11, 30), 3)), '2027-01-02');
  // 2028 is a leap year.
  assert.equal(toLocalDateString(addDays(new Date(2028, 1, 28), 1)), '2028-02-29');
});

test('next Monday is the one coming, from any day of the week', () => {
  // 2026-07-26 is a Sunday.
  const sunday = new Date(2026, 6, 26);
  assert.equal(sunday.getDay(), 0);
  assert.equal(toLocalDateString(nextMonday(sunday)), '2026-07-27');

  // Wednesday the 29th → the 3rd.
  assert.equal(toLocalDateString(nextMonday(new Date(2026, 6, 29))), '2026-08-03');
  // Saturday the 1st → the 3rd.
  assert.equal(toLocalDateString(nextMonday(new Date(2026, 7, 1))), '2026-08-03');
});

test('asked on a Monday, next Monday is a week away and not today', () => {
  // The whole point of the shortcut is "the week after this one". Returning
  // today would make it a no-op on one day in seven, which is exactly the day
  // someone is most likely to be planning the week ahead.
  const monday = new Date(2026, 6, 27);
  assert.equal(monday.getDay(), 1);
  assert.equal(toLocalDateString(nextMonday(monday)), '2026-08-03');
});

test('a plan generated with a start date begins on it, and runs consecutively', () => {
  const config: MealPlanConfig = { days: 7, mealTypes: ['dinner'], seed: 42 };
  const plan = generateMealPlan(['a', 'b', 'c'], config, fromLocalDateString('2026-08-03'));

  assert.equal(plan.length, 7);
  assert.equal(plan[0].date, '2026-08-03');
  assert.equal(plan[6].date, '2026-08-09');
  // No gaps, no repeats.
  const dates = plan.map((d) => d.date);
  assert.equal(new Set(dates).size, 7);
  for (let i = 1; i < dates.length; i++) {
    assert.equal(dates[i], toLocalDateString(addDays(fromLocalDateString(dates[i - 1]), 1)));
  }
});

test('a plan that spans a month boundary keeps counting', () => {
  const config: MealPlanConfig = { days: 5, mealTypes: ['dinner'], seed: 7 };
  const plan = generateMealPlan(['a'], config, fromLocalDateString('2026-07-30'));
  assert.deepEqual(
    plan.map((d) => d.date),
    ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03'],
  );
});

test('no start date still means today', () => {
  const config: MealPlanConfig = { days: 2, mealTypes: ['dinner'], seed: 1 };
  const plan = generateMealPlan(['a'], config);
  assert.equal(plan[0].date, toLocalDateString(new Date()));
});
