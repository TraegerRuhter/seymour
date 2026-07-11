import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportBundle, importBundle, validateBundle } from '../src/lib/actions.ts';
import { useRecipeStore, usePlanStore, useShoppingStore, useSettingsStore } from '../src/lib/stores.ts';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { CURRENT_BUNDLE_VERSION, type ExportBundle } from '../src/lib/types.ts';

/**
 * Covers the two upgrade paths that must survive future schema changes:
 * the IndexedDB-persisted stores (zustand's `version`/`migrate`) and the
 * downloadable backup file (`ExportBundle`). Both silently drop a user's
 * data on a version bump unless a migrate path is defined for it, so these
 * tests exist to catch a future change that forgets to add one.
 */

test('every persisted store has a migrate function wired up', () => {
  for (const store of [useRecipeStore, usePlanStore, useShoppingStore, useSettingsStore]) {
    const opts = store.persist.getOptions();
    assert.equal(typeof opts.version, 'number');
    assert.equal(typeof opts.migrate, 'function');
  }
});

test('recipe store migrate passes through old (pre-versioning) data unchanged', () => {
  const opts = useRecipeStore.persist.getOptions();
  const oldData = {
    recipes: { r1: { id: 'r1', title: 'Toast', sourceUrl: '', ingredients: [], instructions: [], dateAdded: '2023-01-01' } },
  };
  const migrated = opts.migrate!(oldData, 0);
  assert.deepEqual(migrated, oldData);
});

test('every store migrate degrades malformed/missing persisted data to safe defaults instead of throwing', () => {
  const stores = [useRecipeStore, usePlanStore, useShoppingStore, useSettingsStore];
  for (const store of stores) {
    const garbage = {};
    const opts = store.persist.getOptions();
    assert.doesNotThrow(() => opts.migrate!(garbage, 0));
    assert.doesNotThrow(() => opts.migrate!(null, 0));
    assert.doesNotThrow(() => opts.migrate!(undefined, 0));
  }
});

test('exportBundle round-trips through validateBundle and importBundle', () => {
  useRecipeStore.getState().replaceAll({
    r1: { id: 'r1', title: 'Toast', sourceUrl: '', ingredients: [parseIngredient('2 slices bread')], instructions: ['Toast it.'], dateAdded: '2024-01-01T00:00:00.000Z' },
  });
  const bundle = exportBundle();
  assert.equal(bundle.version, CURRENT_BUNDLE_VERSION);
  assert.ok(validateBundle(bundle));

  useRecipeStore.getState().replaceAll({});
  importBundle(bundle);
  assert.deepEqual(Object.keys(useRecipeStore.getState().recipes), ['r1']);
});

test('validateBundle accepts an old backup missing archivedPlans and importBundle fills the default', () => {
  const oldBundle = {
    version: 1,
    exportedAt: '2024-01-01T00:00:00.000Z',
    recipes: {},
    mealPlan: null,
    mealPlanConfig: null,
    shoppingList: [],
    // archivedPlans intentionally absent — this is what backups exported
    // before that feature shipped actually look like.
  };
  assert.ok(validateBundle(oldBundle));
  usePlanStore.getState().replaceAll(null, null, [{ id: 'stale', archivedAt: '2020-01-01', label: 'stale', config: { days: 1, mealTypes: ['dinner'], seed: 1 }, plan: [] }]);
  importBundle(oldBundle as ExportBundle);
  assert.deepEqual(usePlanStore.getState().archivedPlans, []);
});

test('validateBundle rejects a bundle from a future, not-yet-understood version', () => {
  const futureBundle = {
    version: CURRENT_BUNDLE_VERSION + 1,
    exportedAt: new Date().toISOString(),
    recipes: {},
    mealPlan: null,
    mealPlanConfig: null,
    shoppingList: [],
  };
  assert.equal(validateBundle(futureBundle), false);
});

test('validateBundle rejects garbage without throwing', () => {
  assert.equal(validateBundle(null), false);
  assert.equal(validateBundle(undefined), false);
  assert.equal(validateBundle('not an object'), false);
  assert.equal(validateBundle({}), false);
  assert.equal(validateBundle({ version: 0 }), false);
});
