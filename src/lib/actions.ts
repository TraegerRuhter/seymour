'use client';

import { nanoid } from 'nanoid';
import type {
  ExportBundle,
  MealPlanConfig,
  MealType,
  ParsedRecipeData,
  Recipe,
} from './types';
import { parseIngredientLines } from './ingredient-parser';
import { buildShoppingList, mergeShoppingList } from './aggregate';
import { generateMealPlan, newSeed } from './plan';
import { usePlanStore, useRecipeStore, useShoppingStore } from './stores';

/**
 * Cross-store orchestration lives here so individual stores stay decoupled.
 * Every mutation that can affect the active plan re-derives the shopping
 * list, carrying over checked state and manual overrides.
 */

export function regenerateShoppingList(): void {
  const { plan } = usePlanStore.getState();
  const { recipes } = useRecipeStore.getState();
  const shopping = useShoppingStore.getState();
  const next = buildShoppingList(plan, recipes);
  shopping.setItems(mergeShoppingList(next, shopping.items));
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

// --- Export / Import ---

export function exportBundle(): ExportBundle {
  const { recipes } = useRecipeStore.getState();
  const { config, plan } = usePlanStore.getState();
  const { items } = useShoppingStore.getState();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes,
    mealPlan: plan,
    mealPlanConfig: config,
    shoppingList: items,
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
  return true;
}

/** Replaces the entire database with an imported bundle. */
export function importBundle(bundle: ExportBundle): void {
  useRecipeStore.getState().replaceAll(bundle.recipes);
  usePlanStore.getState().replaceAll(bundle.mealPlanConfig, bundle.mealPlan);
  useShoppingStore.getState().replaceAll(bundle.shoppingList);
}
