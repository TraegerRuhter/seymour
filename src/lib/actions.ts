'use client';

import { nanoid } from 'nanoid';
import {
  CURRENT_BUNDLE_VERSION,
  type ArchivedPlan,
  type ExportBundle,
  type MealPlanConfig,
  type MealType,
  type ParsedRecipeData,
  type Recipe,
} from './types';
import { parseIngredientLines } from './ingredient-parser';
import { buildShoppingList, mergeShoppingList } from './aggregate';
import { generateMealPlan, newSeed, planLabel, recipeFitsMealType } from './plan';
import { usePlanStore, useRecipeStore, useSettingsStore, useShoppingStore } from './stores';

/**
 * Cross-store orchestration lives here so individual stores stay decoupled.
 * Every mutation that can affect the active plan re-derives the shopping
 * list, carrying over checked state and manual overrides.
 * 
 * Shopping list updates are debounced to avoid excessive re-aggregation
 * during rapid mutations (e.g., form edits, plan regenerations).
 */

let debounceTimeout: NodeJS.Timeout | null = null;

export function regenerateShoppingList(): void {
  // Clear any pending debounce
  if (debounceTimeout) clearTimeout(debounceTimeout);
  
  // Debounce for 50ms to batch rapid updates (form typing, quick actions)
  debounceTimeout = setTimeout(() => {
    const { plan } = usePlanStore.getState();
    const { recipes } = useRecipeStore.getState();
    const { unitSystem } = useSettingsStore.getState();
    const shopping = useShoppingStore.getState();
    const next = buildShoppingList(plan, recipes, unitSystem);
    shopping.setItems(mergeShoppingList(next, shopping.items));
    debounceTimeout = null;
  }, 50);
}

export function recipeFromParsed(data: ParsedRecipeData): Recipe {
  return {
    id: nanoid(),
    title: data.title,
    sourceUrl: data.sourceUrl,
    imageUrl: data.imageUrl,
    ingredients: parseIngredientLines(data.ingredientLines),
    instructions: data.instructions.filter((s) => s.trim()),
    dateAdded: new Date().toISOString(),
  };
}

export function saveRecipes(recipes: Recipe[]): void {
  useRecipeStore.getState().addRecipes(recipes);
  regenerateShoppingList();
}

export function saveRecipe(recipe: Recipe): void {
  useRecipeStore.getState().addRecipe(recipe);
  regenerateShoppingList();
}

/** Deletes a recipe, clears any plan slots that referenced it, and re-aggregates. */
export function deleteRecipe(id: string): void {
  useRecipeStore.getState().removeRecipe(id);
  usePlanStore.getState().clearRecipeFromPlan(id);
  regenerateShoppingList();
}

export function generatePlan(days: number, mealTypes: MealType[], seed?: number): void {
  const config: MealPlanConfig = {
    days,
    mealTypes,
    seed: seed ?? newSeed(),
  };
  // Read ids straight from the source of truth. (An earlier cache optimization
  // broke this: the cache isn't persisted, so after a fresh page load it was
  // empty and every generated slot came out unfilled.)
  const recipes = useRecipeStore.getState().recipes;
  const recipeIds = Object.keys(recipes);
  const plan = generateMealPlan(
    recipeIds,
    config,
    undefined,
    (id, type) => {
      const recipe = recipes[id];
      return !recipe || recipeFitsMealType(recipe, type);
    },
    (id) => recipes[id]?.mainIngredient?.trim().toLowerCase() || undefined,
  );
  usePlanStore.getState().setPlan(config, plan);
  regenerateShoppingList();
}

/** Re-runs the current configuration with a fresh seed. */
export function regeneratePlan(): void {
  const { config } = usePlanStore.getState();
  if (!config) return;
  generatePlan(config.days, config.mealTypes, newSeed());
}

export function pickSlotRecipe(dayIndex: number, mealIndex: number, recipeId: string): void {
  usePlanStore.getState().setSlot(dayIndex, mealIndex, recipeId);
  regenerateShoppingList();
}

/** Swaps a single filled (or empty) slot for a different, randomly chosen eligible recipe. */
export function shuffleSlot(dayIndex: number, mealIndex: number): void {
  const slot = usePlanStore.getState().plan?.[dayIndex]?.meals[mealIndex];
  if (!slot) return;
  const recipes = useRecipeStore.getState().recipes;
  const all = Object.values(recipes);
  const fitting = all.filter((r) => recipeFitsMealType(r, slot.type));
  const pool = fitting.length > 0 ? fitting : all;
  const candidates = pool.length > 1 ? pool.filter((r) => r.id !== slot.recipeId) : pool;
  if (candidates.length === 0) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  pickSlotRecipe(dayIndex, mealIndex, pick.id);
}

// --- Plan archive ---

/** Moves the current plan into the archive and clears the active slot. */
export function archiveCurrentPlan(): void {
  const { config, plan } = usePlanStore.getState();
  if (!config || !plan) return;
  const entry: ArchivedPlan = {
    id: nanoid(),
    archivedAt: new Date().toISOString(),
    label: planLabel(plan, config),
    config,
    plan,
  };
  usePlanStore.getState().pushArchived(entry);
  usePlanStore.getState().clearPlan();
  regenerateShoppingList();
}

/** Makes an archived plan the active one again (and removes it from the archive). */
export function restoreArchivedPlan(id: string): void {
  const entry = usePlanStore.getState().archivedPlans.find((a) => a.id === id);
  if (!entry) return;
  usePlanStore.getState().setPlan(entry.config, entry.plan);
  usePlanStore.getState().deleteArchived(id);
  regenerateShoppingList();
}

export function deleteArchivedPlan(id: string): void {
  usePlanStore.getState().deleteArchived(id);
}

export function clearArchivedPlans(): void {
  usePlanStore.getState().clearArchived();
}

/** Deletes the current plan without archiving it. */
export function clearCurrentPlan(): void {
  usePlanStore.getState().clearPlan();
  regenerateShoppingList();
}

// --- Bulk data management ---

/** Removes every recipe and clears the current plan (its slots would be empty). */
export function deleteAllRecipes(): void {
  useRecipeStore.getState().replaceAll({});
  usePlanStore.getState().clearPlan();
  regenerateShoppingList();
}

/** Rebuilds the shopping list from the current plan, dropping checks and edits. */
export function resetShoppingList(): void {
  useShoppingStore.getState().replaceAll([]);
  regenerateShoppingList();
}

/** Wipes all data: recipes, current + archived plans, and shopping list. */
export function resetEverything(): void {
  useRecipeStore.getState().replaceAll({});
  usePlanStore.getState().replaceAll(null, null, []);
  useShoppingStore.getState().replaceAll([]);
}

// --- Export / Import ---

export function exportBundle(): ExportBundle {
  const { recipes } = useRecipeStore.getState();
  const { config, plan, archivedPlans } = usePlanStore.getState();
  const { items } = useShoppingStore.getState();
  return {
    version: CURRENT_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
    mealPlan: plan,
    mealPlanConfig: config,
    shoppingList: items,
    archivedPlans,
  };
}

/**
 * A backup a user downloads today might still be sitting in their Downloads
 * folder years from now, long after ExportBundle's shape has moved on. This
 * accepts any bundle whose version we recognize (1..CURRENT_BUNDLE_VERSION)
 * and only rejects something too old to be understood or, more likely,
 * exported by a *newer* build than this one (can't migrate forward from a
 * shape we haven't been taught yet).
 */
export function validateBundle(data: unknown): data is ExportBundle {
  if (typeof data !== 'object' || data === null) return false;
  const b = data as Partial<ExportBundle>;
  if (typeof b.version !== 'number' || b.version < 1 || b.version > CURRENT_BUNDLE_VERSION) return false;
  if (typeof b.recipes !== 'object' || b.recipes === null) return false;
  for (const r of Object.values(b.recipes)) {
    if (typeof r.id !== 'string' || typeof r.title !== 'string') return false;
    if (!Array.isArray(r.ingredients) || !Array.isArray(r.instructions)) return false;
  }
  if (b.mealPlan !== null && !Array.isArray(b.mealPlan)) return false;
  if (!Array.isArray(b.shoppingList)) return false;
  if (b.archivedPlans !== undefined && !Array.isArray(b.archivedPlans)) return false;
  return true;
}

/**
 * Upgrades a validated bundle of any known older version to the current
 * shape, filling sensible defaults for anything added since it was
 * exported. Add a case here — and never remove an old one — every time
 * CURRENT_BUNDLE_VERSION bumps, so a backup exported years ago still
 * imports cleanly instead of dropping data or crashing on a missing field.
 */
function migrateBundle(bundle: ExportBundle): ExportBundle {
  // Only one shape exists so far; this is the identity case that every
  // future migration chain will fall through to once it reaches version 1.
  return {
    version: CURRENT_BUNDLE_VERSION,
    exportedAt: bundle.exportedAt,
    recipes: bundle.recipes,
    mealPlan: bundle.mealPlan,
    mealPlanConfig: bundle.mealPlanConfig,
    shoppingList: bundle.shoppingList,
    archivedPlans: bundle.archivedPlans ?? [],
  };
}

/** Replaces the entire database with an imported bundle. */
export function importBundle(bundle: ExportBundle): void {
  const migrated = migrateBundle(bundle);
  useRecipeStore.getState().replaceAll(migrated.recipes);
  usePlanStore.getState().replaceAll(migrated.mealPlanConfig, migrated.mealPlan, migrated.archivedPlans ?? []);
  useShoppingStore.getState().replaceAll(migrated.shoppingList);
}