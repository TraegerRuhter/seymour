import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadTiming, mealSlotAt, orderFromNow } from '../src/lib/time-of-day.ts';
import type { MealType } from '../src/lib/types.ts';

/** Local time on an arbitrary fixed day. */
const at = (h: number, m = 0) => new Date(2026, 6, 25, h, m);
const meals = (...types: MealType[]) => types.map((type) => ({ type }));
const types = (list: Array<{ type: MealType }>) => list.map((m) => m.type);

test('each hour lands in the meal slot you would expect', () => {
  assert.equal(mealSlotAt(at(7)), 'breakfast');
  assert.equal(mealSlotAt(at(10, 59)), 'breakfast');
  assert.equal(mealSlotAt(at(11)), 'lunch');
  assert.equal(mealSlotAt(at(14, 30)), 'lunch');
  assert.equal(mealSlotAt(at(15)), 'snack');
  assert.equal(mealSlotAt(at(17, 29)), 'snack');
  assert.equal(mealSlotAt(at(17, 30)), 'dinner');
  assert.equal(mealSlotAt(at(20, 59)), 'dinner');
  assert.equal(mealSlotAt(at(21)), 'dessert');
});

test('the small hours belong to the night that has not finished yet', () => {
  // 1am should not be hurrying anyone towards breakfast.
  assert.equal(mealSlotAt(at(1)), 'dessert');
  assert.equal(mealSlotAt(at(3, 59)), 'dessert');
  assert.equal(mealSlotAt(at(4)), 'breakfast');
});

test('at breakfast time the day reads in its normal order', () => {
  const ordered = orderFromNow(meals('breakfast', 'lunch', 'dinner'), at(8));
  assert.deepEqual(types(ordered), ['breakfast', 'lunch', 'dinner']);
});

test('at 5pm dinner leads instead of coming third', () => {
  const ordered = orderFromNow(meals('breakfast', 'lunch', 'dinner'), at(17, 30));
  assert.deepEqual(types(ordered), ['dinner', 'breakfast', 'lunch']);
});

test('a plan with no meal in the current slot leads with the next one', () => {
  // 3pm is the snack slot, but nothing is planned for it.
  const ordered = orderFromNow(meals('breakfast', 'lunch', 'dinner'), at(15));
  assert.deepEqual(types(ordered), ['dinner', 'breakfast', 'lunch']);
});

test('once the day is over the list wraps back to the start', () => {
  const ordered = orderFromNow(meals('breakfast', 'lunch'), at(22));
  assert.deepEqual(types(ordered), ['breakfast', 'lunch']);
});

test('meals are put in chronological order, not the order they were stored', () => {
  // The app's own MEAL_TYPES order puts snack after dinner.
  const ordered = orderFromNow(meals('dinner', 'snack', 'breakfast'), at(8));
  assert.deepEqual(types(ordered), ['breakfast', 'snack', 'dinner']);
});

test('an empty day stays empty', () => {
  assert.deepEqual(orderFromNow([], at(12)), []);
});

test('the lead is only called "now" when it really is now', () => {
  assert.equal(leadTiming('dinner', at(19)), 'now');
  assert.equal(leadTiming('dinner', at(15)), 'next');
  // Everything today is behind you; the list has wrapped to tomorrow's.
  assert.equal(leadTiming('breakfast', at(22)), undefined);
  assert.equal(leadTiming(undefined, at(12)), undefined);
});
