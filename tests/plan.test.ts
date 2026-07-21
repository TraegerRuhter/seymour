import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMealPlan,
  mulberry32,
  planLabel,
  recipeFitsMealType,
  refillPlan,
  seededShuffle,
} from '../src/lib/plan.ts';
import type { MealPlanConfig, MealPlanDay, MealType, Recipe } from '../src/lib/types.ts';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

// Every slot now carries a stable nanoid for drag-and-drop, generated fresh
// (not seeded) on each call — determinism only ever meant "the same recipe
// choices," never "the same ids," so strip them before comparing.
const stripIds = (plan: MealPlanDay[]) =>
  plan.map((day) => ({
    ...day,
    meals: day.meals.map((slot) => {
      const copy = { ...slot };
      delete copy.id;
      return copy;
    }),
  }));

test('same seed produces the same plan', () => {
  const config: MealPlanConfig = { days: 7, mealTypes: ['breakfast', 'lunch', 'dinner'], seed: 42 };
  const start = new Date(2026, 6, 7);
  const a = generateMealPlan(ids(10), config, start);
  const b = generateMealPlan(ids(10), config, start);
  assert.deepEqual(stripIds(a), stripIds(b));
});

test('different seeds produce different plans (usually)', () => {
  const start = new Date(2026, 6, 7);
  const a = generateMealPlan(
    ids(10),
    { days: 7, mealTypes: ['breakfast', 'lunch', 'dinner'], seed: 1 },
    start,
  );
  const b = generateMealPlan(
    ids(10),
    { days: 7, mealTypes: ['breakfast', 'lunch', 'dinner'], seed: 2 },
    start,
  );
  assert.notDeepEqual(a, b);
});

test('no recipe repeats within a single day when collection is large enough', () => {
  const plan = generateMealPlan(ids(5), {
    days: 14,
    mealTypes: ['breakfast', 'lunch', 'dinner', 'snack'],
    seed: 7,
  });
  for (const day of plan) {
    const seen = new Set(day.meals.map((m) => m.recipeId));
    assert.equal(seen.size, day.meals.length, `duplicates within ${day.date}`);
  }
});

test('fills all slots even when collection is smaller than meals per day', () => {
  const plan = generateMealPlan(ids(2), {
    days: 3,
    mealTypes: ['breakfast', 'lunch', 'dinner'],
    seed: 3,
  });
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
    assert.deepEqual(
      day.meals.map((m) => m.type),
      ['lunch', 'dinner'],
    );
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('generateMealPlan restricts each meal type to its eligible recipes', () => {
  // r0-r2 are breakfast-only, r3-r5 are dinner-only.
  const isEligible = (id: string, type: MealType) =>
    type === 'breakfast' ? ['r0', 'r1', 'r2'].includes(id) : ['r3', 'r4', 'r5'].includes(id);
  const plan = generateMealPlan(
    ids(6),
    { days: 5, mealTypes: ['breakfast', 'dinner'], seed: 11 },
    undefined,
    isEligible,
  );
  for (const day of plan) {
    const breakfast = day.meals.find((m) => m.type === 'breakfast')!;
    const dinner = day.meals.find((m) => m.type === 'dinner')!;
    assert.ok(['r0', 'r1', 'r2'].includes(breakfast.recipeId));
    assert.ok(['r3', 'r4', 'r5'].includes(dinner.recipeId));
  }
});

test('generateMealPlan falls back to the full collection when a meal type has zero eligible recipes', () => {
  // Nothing is tagged "snack" — every recipe is breakfast-only.
  const isEligible = (_id: string, type: MealType) => type === 'breakfast';
  const plan = generateMealPlan(
    ids(3),
    { days: 2, mealTypes: ['snack'], seed: 5 },
    undefined,
    isEligible,
  );
  for (const day of plan) {
    assert.ok(day.meals[0].recipeId, 'snack slot should still be filled');
  }
});

test("generateMealPlan avoids repeating the previous day's main ingredient when variety exists", () => {
  // r0, r1 are "beef"; r2, r3 are "chicken".
  const mainIngredient = new Map([
    ['r0', 'beef'],
    ['r1', 'beef'],
    ['r2', 'chicken'],
    ['r3', 'chicken'],
  ]);
  const getMainIngredient = (id: string) => mainIngredient.get(id);
  const plan = generateMealPlan(
    ['r0', 'r1', 'r2', 'r3'],
    { days: 10, mealTypes: ['dinner'], seed: 42 },
    undefined,
    undefined,
    getMainIngredient,
  );
  for (let i = 1; i < plan.length; i++) {
    const prev = mainIngredient.get(plan[i - 1].meals[0].recipeId);
    const cur = mainIngredient.get(plan[i].meals[0].recipeId);
    assert.notEqual(cur, prev, `day ${i} repeats ${prev} from the day before`);
  }
});

test('generateMealPlan variety preference still fills every slot when avoidance is impossible', () => {
  // Every recipe shares the same main ingredient, so avoidance can never succeed.
  const getMainIngredient = () => 'beef';
  const plan = generateMealPlan(
    ['r0', 'r1'],
    { days: 6, mealTypes: ['breakfast', 'lunch', 'dinner'], seed: 8 },
    undefined,
    undefined,
    getMainIngredient,
  );
  for (const day of plan) {
    for (const meal of day.meals) assert.ok(meal.recipeId, 'every slot should still be filled');
  }
});

test('recipeFitsMealType: untagged recipes fit any meal, tagged recipes are restricted', () => {
  const base: Recipe = {
    id: 'x',
    title: 'Test',
    sourceUrl: '',
    ingredients: [],
    instructions: [],
    dateAdded: new Date().toISOString(),
  };
  assert.equal(recipeFitsMealType(base, 'dinner'), true);
  assert.equal(recipeFitsMealType({ ...base, mealTypes: [] }, 'dinner'), true);
  assert.equal(recipeFitsMealType({ ...base, mealTypes: ['breakfast', 'snack'] }, 'dinner'), false);
  assert.equal(recipeFitsMealType({ ...base, mealTypes: ['dinner'] }, 'dinner'), true);
});

function makePlan(
  days: { date: string; meals: { type: MealType; recipeId: string; pinned?: boolean }[] }[],
): MealPlanDay[] {
  return days;
}

test('refillPlan fills only empty slots, leaving filled ones untouched', () => {
  const plan = makePlan([
    {
      date: '2026-07-14',
      meals: [
        { type: 'lunch', recipeId: 'r0' },
        { type: 'dinner', recipeId: '' },
      ],
    },
    { date: '2026-07-15', meals: [{ type: 'dinner', recipeId: 'r1' }] },
  ]);
  const next = refillPlan(plan, ids(6), 42, (slot) => !slot.recipeId);
  assert.equal(next[0].meals[0].recipeId, 'r0', 'filled slot must not change');
  assert.ok(next[0].meals[1].recipeId, 'empty slot must be filled');
  assert.equal(next[1].meals[0].recipeId, 'r1');
});

test('refillPlan re-rolls unpinned slots but never pinned ones', () => {
  const plan = makePlan([
    {
      date: '2026-07-14',
      meals: [
        { type: 'dinner', recipeId: 'r0', pinned: true },
        { type: 'lunch', recipeId: 'r1' },
      ],
    },
  ]);
  // With many candidates and enough seeds, the unpinned slot changes at least
  // once while the pinned slot never does.
  let unpinnedChanged = false;
  for (let seed = 0; seed < 20; seed++) {
    const next = refillPlan(plan, ids(10), seed, (slot) => !slot.pinned);
    assert.equal(next[0].meals[0].recipeId, 'r0', `seed ${seed} touched a pinned slot`);
    assert.equal(next[0].meals[0].pinned, true, 'pinned flag survives the refill');
    if (next[0].meals[1].recipeId !== 'r1') unpinnedChanged = true;
  }
  assert.ok(unpinnedChanged, 'unpinned slot should re-roll across seeds');
});

test('refillPlan avoids duplicating a kept recipe within the same day', () => {
  const plan = makePlan([
    {
      date: '2026-07-14',
      meals: [
        { type: 'dinner', recipeId: '' },
        { type: 'lunch', recipeId: 'r3', pinned: true },
      ],
    },
  ]);
  for (let seed = 0; seed < 30; seed++) {
    const next = refillPlan(plan, ids(8), seed, (slot) => !slot.recipeId);
    assert.notEqual(next[0].meals[0].recipeId, 'r3', `seed ${seed} duplicated the kept recipe`);
  }
});

test('refillPlan respects meal-type eligibility and is deterministic per seed', () => {
  const isEligible = (id: string, type: MealType) =>
    type === 'dessert' ? id === 'r5' : id !== 'r5';
  const plan = makePlan([
    {
      date: '2026-07-14',
      meals: [
        { type: 'dinner', recipeId: '' },
        { type: 'dessert', recipeId: '' },
      ],
    },
  ]);
  const a = refillPlan(plan, ids(6), 7, () => true, isEligible);
  const b = refillPlan(plan, ids(6), 7, () => true, isEligible);
  assert.deepEqual(stripIds(a), stripIds(b), 'same seed must produce the same refill');
  assert.equal(a[0].meals[1].recipeId, 'r5', 'dessert slot must draw the only eligible dessert');
  assert.notEqual(
    a[0].meals[0].recipeId,
    'r5',
    'dinner slot must not draw the dessert-only recipe',
  );
});

test('refillPlan with an empty collection returns the plan unchanged', () => {
  const plan = makePlan([{ date: '2026-07-14', meals: [{ type: 'dinner', recipeId: '' }] }]);
  assert.deepEqual(
    refillPlan(plan, [], 1, () => true),
    plan,
  );
});

test('seededShuffle is deterministic and a permutation', () => {
  const rand1 = mulberry32(123);
  const rand2 = mulberry32(123);
  const a = seededShuffle([1, 2, 3, 4, 5], rand1);
  const b = seededShuffle([1, 2, 3, 4, 5], rand2);
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5]);
});

test('planLabel summarizes days, dates, and meals', () => {
  const config: MealPlanConfig = { days: 3, mealTypes: ['dinner'], seed: 1 };
  const start = new Date(2026, 6, 7); // Jul 7 2026
  const plan = generateMealPlan(ids(5), config, start);
  const label = planLabel(plan, config);
  assert.match(label, /^3 days · /);
  assert.match(label, /Dinner$/);
  assert.ok(label.includes('–'), 'multi-day label shows a date range');
});

test('planLabel handles a single day (no range dash)', () => {
  const config: MealPlanConfig = { days: 1, mealTypes: ['breakfast', 'lunch'], seed: 2 };
  const plan = generateMealPlan(ids(3), config, new Date(2026, 6, 7));
  const label = planLabel(plan, config);
  assert.match(label, /^1 day · /);
  assert.ok(!label.includes('–'), 'single-day label has no range dash');
  assert.match(label, /Breakfast, Lunch$/);
});
