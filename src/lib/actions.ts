'use client';

import { nanoid } from 'nanoid';
import type {
  ArchivedPlan,
  ExportBundle,
  MealPlanConfig,
  MealType,
  ParsedRecipeData,
  Recipe,
} from './types';
import { parseIngredientLines } from './ingredient-parser';
import { buildShoppingList, mergeShoppingList } from './aggregate';
import { generateMealPlan, newSeed, planLabel } from './plan';
import { usePlanStore, useRecipeStore, useShoppingStore } from './stores';

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
    const shopping = useShoppingStore.getState();
    const next = buildShoppingList(plan, recipes);
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
  const recipeIds = Object.keys(useRecipeStore.getState().recipes);
  const plan = generateMealPlan(recipeIds, config);
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
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes,
    mealPlan: plan,
    mealPlanConfig: config,
    shoppingList: items,
    archivedPlans,
  };
}

export function validateBundle(data: unknown): data is ExportBundle {
  if (typeof data !== 'object' || data === null) return false;
  const b = data as Partial<ExportBundle>;
  if (b.version !== 1) return false;
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

/** Replaces the entire database with an imported bundle. */
export function importBundle(bundle: ExportBundle): void {
  useRecipeStore.getState().replaceAll(bundle.recipes);
  usePlanStore.getState().replaceAll(bundle.mealPlanConfig, bundle.mealPlan, bundle.archivedPlans ?? []);
  useShoppingStore.getState().replaceAll(bundle.shoppingList);
}