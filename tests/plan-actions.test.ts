import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureMealIds, moveMealSlot } from '../src/lib/actions.ts';
import { usePlanStore } from '../src/lib/stores.ts';
import type { MealPlanDay } from '../src/lib/types.ts';

function seedPlan(days: MealPlanDay[]) {
  usePlanStore.setState({
    plan: days,
    config: { days: days.length, mealTypes: ['dinner'], seed: 1 },
  });
}

test('moveMealSlot reorders meals within the same day', () => {
  seedPlan([
    {
      date: '2026-07-14',
      meals: [
        { type: 'breakfast', recipeId: 'r1', id: 'a' },
        { type: 'lunch', recipeId: 'r2', id: 'b' },
        { type: 'dinner', recipeId: 'r3', id: 'c' },
      ],
    },
  ]);
  moveMealSlot(0, 0, 0, 2);
  const meals = usePlanStore.getState().plan![0].meals;
  assert.deepEqual(
    meals.map((m) => m.id),
    ['b', 'c', 'a'],
  );
});

test('moveMealSlot moves a meal from one day to another', () => {
  seedPlan([
    { date: '2026-07-14', meals: [{ type: 'dinner', recipeId: 'r1', id: 'a' }] },
    { date: '2026-07-15', meals: [{ type: 'dinner', recipeId: 'r2', id: 'b' }] },
  ]);
  moveMealSlot(0, 0, 1, 0);
  const plan = usePlanStore.getState().plan!;
  assert.equal(plan[0].meals.length, 0);
  assert.deepEqual(
    plan[1].meals.map((m) => m.id),
    ['a', 'b'],
  );
});

test('moveMealSlot appends to the end of the target day when dropped past its last meal', () => {
  seedPlan([
    { date: '2026-07-14', meals: [{ type: 'dinner', recipeId: 'r1', id: 'a' }] },
    { date: '2026-07-15', meals: [{ type: 'dinner', recipeId: 'r2', id: 'b' }] },
  ]);
  moveMealSlot(0, 0, 1, 1); // 1 == target day's length, i.e. "append"
  const plan = usePlanStore.getState().plan!;
  assert.deepEqual(
    plan[1].meals.map((m) => m.id),
    ['b', 'a'],
  );
});

test('moveMealSlot to the same position leaves the plan unchanged', () => {
  seedPlan([{ date: '2026-07-14', meals: [{ type: 'dinner', recipeId: 'r1', id: 'a' }] }]);
  moveMealSlot(0, 0, 0, 0);
  assert.deepEqual(
    usePlanStore.getState().plan![0].meals.map((m) => m.id),
    ['a'],
  );
});

test('ensureMealIds backfills a legacy slot missing an id, leaving existing ids untouched', () => {
  seedPlan([
    {
      date: '2026-07-14',
      meals: [
        { type: 'dinner', recipeId: 'r1' },
        { type: 'lunch', recipeId: 'r2', id: 'keep-me' },
      ],
    },
  ]);
  ensureMealIds();
  const meals = usePlanStore.getState().plan![0].meals;
  assert.ok(meals[0].id, 'legacy slot without an id got backfilled');
  assert.equal(meals[1].id, 'keep-me', 'existing id left untouched');
});

test('ensureMealIds is a no-op (no new plan reference) once every slot already has an id', () => {
  seedPlan([{ date: '2026-07-14', meals: [{ type: 'dinner', recipeId: 'r1', id: 'a' }] }]);
  const before = usePlanStore.getState().plan;
  ensureMealIds();
  assert.equal(usePlanStore.getState().plan, before);
});
