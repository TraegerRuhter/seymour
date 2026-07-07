import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMealPlan, mulberry32, seededShuffle } from '../src/lib/plan.ts';
import type { MealPlanConfig } from '../src/lib/types.ts';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

test('same seed produces the same plan', () => {
  const config: MealPlanConfig = { days: 7, mealTypes: ['breakfast', 'lunch', 'dinner'], seed: 42 };
  const start = new Date(2026, 6, 7);
  const a = generateMealPlan(ids(10), config, start);
  const b = generateMealPlan(ids(10), config, start);
  assert.deepEqual(a, b);
});

test('different seeds produce different plans (usually)', () => {
  const start = new Date(2026, 6, 7);
  const a = generateMealPlan(ids(10), { days: 7, mealTypes: ['breakfast', 'lunch', 'dinner'], seed: 1 }, start);
  const b = generateMealPlan(ids(10), { days: 7, mealTypes: ['breakfast', 'lunch', 'dinner'], seed: 2 }, start);
  assert.notDeepEqual(a, b);
});

test('no recipe repeats within a single day when collection is large enough', () => {
  const plan = generateMealPlan(ids(5), { days: 14, mealTypes: ['breakfast', 'lunch', 'dinner', 'snack'], seed: 7 });
  for (const day of plan) {
    const seen = new Set(day.meals.map((m) => m.recipeId));
    assert.equal(seen.size, day.meals.length, `duplicates within ${day.date}`);
  }
});

test('fills all slots even when collection is smaller than meals per day', () => {
  const plan = generateMealPlan(ids(2), { days: 3, mealTypes: ['breakfast', 'lunch', 'dinner'], seed: 3 });
  for (const day of plan) {
    for (const meal of day.meals) assert.ok(meal.recipeId);
  }
});

test('empty collection yields empty slots', () => {
  const plan = generateMealPlan([], { days: 2, mealTypes: ['dinner'], seed: 1 });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].meals[0].recipeId, '');
});

test('plan has correct shape: days × mealTypes', () => {
  const plan = generateMealPlan(ids(8), { days: 4, mealTypes: ['lunch', 'dinner'], seed: 9 });
  assert.equal(plan.length, 4);
  for (const day of plan) {
    assert.deepEqual(day.meals.map((m) => m.type), ['lunch', 'dinner']);
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('seededShuffle is deterministic and a permutation', () => {
  const rand1 = mulberry32(123);
  const rand2 = mulberry32(123);
  const a = seededShuffle([1, 2, 3, 4, 5], rand1);
  const b = seededShuffle([1, 2, 3, 4, 5], rand2);
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5]);
});
