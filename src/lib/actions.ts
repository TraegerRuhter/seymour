'use client';

import { nanoid } from 'nanoid';
import {
  CURRENT_BUNDLE_VERSION,
  type ArchivedPlan,
  type ExportBundle,
  type MealPlanConfig,
  type MealSlot,
  type MealType,
  type ParsedRecipeData,
  type Recipe,
} from './types';
import { parseIngredientLines } from './ingredient-parser';
import { suggestTags } from './auto-tag';
import { buildShoppingList, mergeShoppingList } from './aggregate';
import { normalizeIngredientName } from './normalize';
import { generateMealPlan, newSeed, planLabel, recipeFitsMealType, refillPlan } from './plan';
import {
  clearMealPlanRemote,
  deleteRemote,
  pushArchivedPlan,
  pushMealPlan,
  pushMealPlanDay,
  pushPantryStaples,
  pushRecipe,
  pushSettings,
  pushShoppingItemState,
} from './sync';
import {
  usePantryStore,
  usePlanStore,
  useRecipeStore,
  useSettingsStore,
  useShoppingStore,
} from './stores';
import type { UnitSystem } from './units';

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
    const { staples } = usePantryStore.getState();
    const shopping = useShoppingStore.getState();
    const next = buildShoppingList(plan, recipes, unitSystem, new Set(staples));
    shopping.setItems(mergeShoppingList(next, shopping.items));
    debounceTimeout = null;
  }, 50);
}

// --- Shopping list item state ---

/** Toggles an item's checked state and syncs the change (checked state only, not the item itself). */
export function toggleShoppingItem(id: string): void {
  useShoppingStore.getState().toggleChecked(id);
  const item = useShoppingStore.getState().items.find((i) => i.id === id);
  if (item) void pushShoppingItemState(item);
}

/** Sets (or clears) an item's manual-override text and syncs the change. */
export function setShoppingItemOverride(id: string, text: string): void {
  useShoppingStore.getState().setOverride(id, text);
  const item = useShoppingStore.getState().items.find((i) => i.id === id);
  if (item) void pushShoppingItemState(item);
}

// --- Settings ---

/** Sets the measurement system and syncs the change. Also re-aggregates so the list re-renders in the new units. */
export function setUnitSystem(system: UnitSystem): void {
  useSettingsStore.getState().setUnitSystem(system);
  regenerateShoppingList();
  void pushSettings(useSettingsStore.getState().unitSystem);
}

// --- Pantry staples ("spice rack") ---

/** Adds a staple (normalized the same way recipe ingredients are) and re-aggregates the list. */
export function addPantryStaple(raw: string): void {
  const name = normalizeIngredientName(raw);
  if (!name) return;
  usePantryStore.getState().addStaple(name);
  regenerateShoppingList();
  void pushPantryStaples(usePantryStore.getState().staples);
}

export function removePantryStaple(name: string): void {
  usePantryStore.getState().removeStaple(name);
  regenerateShoppingList();
  void pushPantryStaples(usePantryStore.getState().staples);
}

/**
 * Builds a Recipe from scraped/AI-extracted data and silently pre-tags it
 * (meal type / category / main ingredient) — this path has no manual review
 * step (see handleParse in the add-recipe page), so auto-tagging here is the
 * only way a bulk URL import gets tagged at all without extra per-recipe
 * work. Suggestions only ever fill fields the parser left blank, and every
 * field stays a normal editable field afterward (RecipeForm/edit page).
 */
export function recipeFromParsed(data: ParsedRecipeData): Recipe {
  const ingredients = parseIngredientLines(data.ingredientLines);
  const existingCategories = Object.values(useRecipeStore.getState().recipes)
    .map((r) => r.category)
    .filter((c): c is string => !!c);
  const suggested = suggestTags(
    data.title,
    ingredients.map((i) => i.name),
    existingCategories,
  );
  return {
    id: nanoid(),
    title: data.title,
    sourceUrl: data.sourceUrl,
    imageUrl: data.imageUrl,
    ingredients,
    instructions: data.instructions.filter((s) => s.trim()),
    dateAdded: new Date().toISOString(),
    mealTypes: suggested.mealTypes.length ? suggested.mealTypes : undefined,
    category: suggested.category,
    mainIngredient: suggested.mainIngredient,
  };
}

/**
 * Retroactively suggests tags for every recipe missing mealTypes, category,
 * or mainIngredient — recipes added before auto-tagging existed, or ones
 * that never got manually tagged. Only ever fills a field that's currently
 * blank; a value the user already set (or already cleared) is left alone.
 * Returns how many recipes actually changed.
 */
export function autoTagUntaggedRecipes(): number {
  const all = Object.values(useRecipeStore.getState().recipes);
  const existingCategories = all.map((r) => r.category).filter((c): c is string => !!c);
  const updated: Recipe[] = [];
  for (const recipe of all) {
    const needsMealTypes = !recipe.mealTypes || recipe.mealTypes.length === 0;
    const needsCategory = !recipe.category;
    const needsMainIngredient = !recipe.mainIngredient;
    if (!needsMealTypes && !needsCategory && !needsMainIngredient) continue;

    const suggested = suggestTags(
      recipe.title,
      recipe.ingredients.map((i) => i.name),
      existingCategories,
    );
    const gotSuggestion =
      (needsMealTypes && suggested.mealTypes.length > 0) ||
      (needsCategory && !!suggested.category) ||
      (needsMainIngredient && !!suggested.mainIngredient);
    if (!gotSuggestion) continue;

    updated.push({
      ...recipe,
      mealTypes:
        needsMealTypes && suggested.mealTypes.length ? suggested.mealTypes : recipe.mealTypes,
      category: needsCategory && suggested.category ? suggested.category : recipe.category,
      mainIngredient:
        needsMainIngredient && suggested.mainIngredient
          ? suggested.mainIngredient
          : recipe.mainIngredient,
      updatedAt: new Date().toISOString(),
    });
  }
  if (updated.length === 0) return 0;
  useRecipeStore.getState().addRecipes(updated);
  for (const recipe of updated) void pushRecipe(recipe);
  return updated.length;
}

export function saveRecipes(recipes: Recipe[]): void {
  const stamped = recipes.map((r) => ({ ...r, updatedAt: new Date().toISOString() }));
  useRecipeStore.getState().addRecipes(stamped);
  regenerateShoppingList();
  for (const recipe of stamped) void pushRecipe(recipe);
}

export function saveRecipe(recipe: Recipe): void {
  const stamped = { ...recipe, updatedAt: new Date().toISOString() };
  useRecipeStore.getState().addRecipe(stamped);
  regenerateShoppingList();
  void pushRecipe(stamped);
}

/** Sets (or clears, with `undefined`) a recipe's star rating. Clamped to 0.5–5 in half-star steps. */
export function setRecipeRating(id: string, rating: number | undefined): void {
  const recipe = useRecipeStore.getState().recipes[id];
  if (!recipe) return;
  const clamped =
    rating == null ? undefined : Math.min(5, Math.max(0.5, Math.round(rating * 2) / 2));
  const stamped: Recipe = { ...recipe, rating: clamped, updatedAt: new Date().toISOString() };
  useRecipeStore.getState().updateRecipe(stamped);
  void pushRecipe(stamped);
}

/** Sets a recipe's freeform notes (tweaks, verdicts, substitutions). */
export function setRecipeNotes(id: string, notes: string): void {
  const recipe = useRecipeStore.getState().recipes[id];
  if (!recipe) return;
  const trimmed = notes.trim();
  const stamped: Recipe = {
    ...recipe,
    notes: trimmed || undefined,
    updatedAt: new Date().toISOString(),
  };
  useRecipeStore.getState().updateRecipe(stamped);
  void pushRecipe(stamped);
}

/** Deletes a recipe, clears any plan slots that referenced it, and re-aggregates. */
export function deleteRecipe(id: string): void {
  useRecipeStore.getState().removeRecipe(id);
  usePlanStore.getState().clearRecipeFromPlan(id);
  regenerateShoppingList();
  void deleteRemote('recipe', id);
  const { config, plan } = usePlanStore.getState();
  if (config && plan) void pushMealPlan(config, plan);
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
  const { config: stampedConfig, plan: stampedPlan } = usePlanStore.getState();
  if (stampedConfig && stampedPlan) void pushMealPlan(stampedConfig, stampedPlan);
}

/**
 * Re-rolls the current plan with a fresh seed — but only the unpinned slots,
 * and over the plan's *actual* day/meal structure (user-added and removed
 * meals survive, unlike regenerating from the original config).
 */
export function regeneratePlan(): void {
  refillCurrentPlan((slot) => !slot.pinned);
}

/** Draws recipes for empty slots only, leaving every filled slot alone. */
export function fillEmptySlots(): void {
  refillCurrentPlan((slot) => !slot.recipeId);
}

function refillCurrentPlan(shouldRefill: (slot: MealSlot) => boolean): void {
  const { config, plan } = usePlanStore.getState();
  if (!config || !plan) return;
  const recipes = useRecipeStore.getState().recipes;
  const next = refillPlan(
    plan,
    Object.keys(recipes),
    newSeed(),
    shouldRefill,
    (id, type) => {
      const recipe = recipes[id];
      return !recipe || recipeFitsMealType(recipe, type);
    },
    (id) => recipes[id]?.mainIngredient?.trim().toLowerCase() || undefined,
  );
  usePlanStore.getState().setPlan(config, next);
  regenerateShoppingList();
  const { config: stampedConfig, plan: stampedPlan } = usePlanStore.getState();
  if (stampedConfig && stampedPlan) void pushMealPlan(stampedConfig, stampedPlan);
}

/** Sets one slot's servings multiplier and re-derives the shopping list from it. */
export function setSlotScale(dayIndex: number, mealIndex: number, scale: number): void {
  const clamped = Math.min(10, Math.max(0.25, scale));
  usePlanStore.getState().patchSlot(dayIndex, mealIndex, {
    scale: clamped === 1 ? undefined : clamped,
  });
  regenerateShoppingList();
  const day = usePlanStore.getState().plan?.[dayIndex];
  if (day) void pushMealPlanDay(dayIndex, day);
}

/** Pins or unpins one slot; pinned slots survive a shuffle untouched. */
export function togglePinSlot(dayIndex: number, mealIndex: number): void {
  const slot = usePlanStore.getState().plan?.[dayIndex]?.meals[mealIndex];
  if (!slot) return;
  usePlanStore.getState().patchSlot(dayIndex, mealIndex, { pinned: !slot.pinned });
  const day = usePlanStore.getState().plan?.[dayIndex];
  if (day) void pushMealPlanDay(dayIndex, day);
}

/** Adds an empty slot of the given meal type to a day. */
export function addMealToDay(dayIndex: number, type: MealType): void {
  usePlanStore.getState().addMeal(dayIndex, { type, recipeId: '' });
  const day = usePlanStore.getState().plan?.[dayIndex];
  if (day) void pushMealPlanDay(dayIndex, day);
}

/** Removes a slot from a day entirely (a day can end up with no meals — that's "eating out"). */
export function removeMealFromDay(dayIndex: number, mealIndex: number): void {
  usePlanStore.getState().removeMeal(dayIndex, mealIndex);
  regenerateShoppingList();
  const day = usePlanStore.getState().plan?.[dayIndex];
  if (day) void pushMealPlanDay(dayIndex, day);
}

export function pickSlotRecipe(dayIndex: number, mealIndex: number, recipeId: string): void {
  usePlanStore.getState().setSlot(dayIndex, mealIndex, recipeId);
  regenerateShoppingList();
  const day = usePlanStore.getState().plan?.[dayIndex];
  if (day) void pushMealPlanDay(dayIndex, day);
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
  void pushArchivedPlan(entry);
  void clearMealPlanRemote();
}

/** Makes an archived plan the active one again (and removes it from the archive). */
export function restoreArchivedPlan(id: string): void {
  const entry = usePlanStore.getState().archivedPlans.find((a) => a.id === id);
  if (!entry) return;
  usePlanStore.getState().setPlan(entry.config, entry.plan);
  usePlanStore.getState().deleteArchived(id);
  regenerateShoppingList();
  const { config, plan } = usePlanStore.getState();
  if (config && plan) void pushMealPlan(config, plan);
  void deleteRemote('archived_plan', id);
}

export function deleteArchivedPlan(id: string): void {
  usePlanStore.getState().deleteArchived(id);
  void deleteRemote('archived_plan', id);
}

export function clearArchivedPlans(): void {
  const ids = usePlanStore.getState().archivedPlans.map((a) => a.id);
  usePlanStore.getState().clearArchived();
  for (const id of ids) void deleteRemote('archived_plan', id);
}

/** Deletes the current plan without archiving it. */
export function clearCurrentPlan(): void {
  usePlanStore.getState().clearPlan();
  regenerateShoppingList();
  void clearMealPlanRemote();
}

// --- Bulk data management ---

/** Removes every recipe and clears the current plan (its slots would be empty). */
export function deleteAllRecipes(): void {
  const ids = Object.keys(useRecipeStore.getState().recipes);
  useRecipeStore.getState().replaceAll({});
  usePlanStore.getState().clearPlan();
  regenerateShoppingList();
  for (const id of ids) void deleteRemote('recipe', id);
  void clearMealPlanRemote();
}

/** Rebuilds the shopping list from the current plan, dropping checks and edits. */
export function resetShoppingList(): void {
  useShoppingStore.getState().replaceAll([]);
  regenerateShoppingList();
}

/** Wipes all data: recipes, current + archived plans, shopping list, and pantry staples. */
export function resetEverything(): void {
  const recipeIds = Object.keys(useRecipeStore.getState().recipes);
  const archivedIds = usePlanStore.getState().archivedPlans.map((a) => a.id);
  useRecipeStore.getState().replaceAll({});
  usePlanStore.getState().replaceAll(null, null, []);
  useShoppingStore.getState().replaceAll([]);
  usePantryStore.getState().replaceAll([]);
  for (const id of recipeIds) void deleteRemote('recipe', id);
  for (const id of archivedIds) void deleteRemote('archived_plan', id);
  void clearMealPlanRemote();
  void pushPantryStaples([]);
}

// --- Export / Import ---

export function exportBundle(): ExportBundle {
  const { recipes } = useRecipeStore.getState();
  const { config, plan, archivedPlans } = usePlanStore.getState();
  const { items } = useShoppingStore.getState();
  const { staples } = usePantryStore.getState();
  return {
    version: CURRENT_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
    mealPlan: plan,
    mealPlanConfig: config,
    shoppingList: items,
    archivedPlans,
    pantryStaples: staples,
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
  if (typeof b.version !== 'number' || b.version < 1 || b.version > CURRENT_BUNDLE_VERSION)
    return false;
  if (typeof b.recipes !== 'object' || b.recipes === null) return false;
  for (const r of Object.values(b.recipes)) {
    if (typeof r.id !== 'string' || typeof r.title !== 'string') return false;
    if (!Array.isArray(r.ingredients) || !Array.isArray(r.instructions)) return false;
  }
  if (b.mealPlan !== null && !Array.isArray(b.mealPlan)) return false;
  if (!Array.isArray(b.shoppingList)) return false;
  if (b.archivedPlans !== undefined && !Array.isArray(b.archivedPlans)) return false;
  if (b.pantryStaples !== undefined && !Array.isArray(b.pantryStaples)) return false;
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
    pantryStaples: bundle.pantryStaples ?? [],
  };
}

/** Replaces the entire database with an imported bundle. */
export function importBundle(bundle: ExportBundle): void {
  const migrated = migrateBundle(bundle);
  useRecipeStore.getState().replaceAll(migrated.recipes);
  usePlanStore
    .getState()
    .replaceAll(migrated.mealPlanConfig, migrated.mealPlan, migrated.archivedPlans ?? []);
  useShoppingStore.getState().replaceAll(migrated.shoppingList);
  usePantryStore.getState().replaceAll(migrated.pantryStaples ?? []);
}
