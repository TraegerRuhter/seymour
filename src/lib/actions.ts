'use client';

import { nanoid } from 'nanoid';
import {
  CURRENT_BUNDLE_VERSION,
  type ArchivedPlan,
  type ExportBundle,
  type Ingredient,
  type MealPlanConfig,
  type MealPlanDay,
  type MealSlot,
  type MealType,
  type ParsedRecipeData,
  type Recipe,
} from './types';
import { parseIngredientLines } from './ingredient-parser';
import { applyCorrection, indexCorrections, type Correction } from './corrections';
import { appendCook, removeLastCook } from './cook-log';
import { suggestTags } from './auto-tag';
import { buildShoppingList, mergeShoppingList } from './aggregate';
import { normalizeIngredientName } from './normalize';
import {
  daysWithinHorizon,
  fromLocalDateString,
  generateMealPlan,
  newSeed,
  planLabel,
  recipeFitsMealType,
  refillPlan,
} from './plan';
import {
  clearMealPlanRemote,
  deleteRemote,
  pushArchivedPlan,
  pushMealPlan,
  pushMealPlanDay,
  pushPantryStaples,
  pushRecipe,
  pushSettings,
  clearShoppingItemStatesRemote,
  pushShoppingItemState,
  pushParserReport,
  pushShoppingItemStates,
} from './sync';
import {
  useCorrectionStore,
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
    const { plan, config } = usePlanStore.getState();
    const { recipes } = useRecipeStore.getState();
    const { unitSystem } = useSettingsStore.getState();
    const { staples } = usePantryStore.getState();
    const shopping = useShoppingStore.getState();
    // Only as far ahead as you've said you're shopping. The plan may run
    // further; the list waits to be told.
    const shopped = plan ? daysWithinHorizon(plan, config?.shoppingThrough) : null;
    const next = buildShoppingList(shopped, recipes, unitSystem, new Set(staples));
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

/**
 * Unchecks every item — the "start the shop again" button.
 *
 * Here rather than called straight off the store, which is what the page used
 * to do. Checked state is the one part of a shopping item that syncs, so a
 * bulk change to it that skips the push leaves the server still holding every
 * item as checked; the next pull merges that back and silently re-ticks the
 * whole list.
 */
export function uncheckAllShoppingItems(): void {
  useShoppingStore.getState().uncheckAll();
  void pushShoppingItemStates(useShoppingStore.getState().items);
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
  // A source that already parsed its own ingredients (Spoonacular) beats our
  // reading of the same strings; everything else hands us text and nothing more.
  const corrections = indexCorrections(useCorrectionStore.getState().corrections);
  const ingredients =
    data.ingredients?.map((i) => applyCorrection(i, corrections)) ??
    parseIngredientLines(data.ingredientLines, corrections);
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

/** Every field the parser sets. Compared one by one — see `sameIngredients`. */
const INGREDIENT_FIELDS = [
  'name',
  'quantity',
  'unit',
  'originalString',
  'notes',
  'qualifier',
  // Provenance counts as a change: a correction that happens to agree with the
  // parser still needs recording, or withdrawing it later can't undo anything.
  'correctedBy',
] as const;

/**
 * Whether a re-parse actually changed anything.
 *
 * Field by field rather than by comparing serialized forms, because key order
 * is not ours to rely on: Postgres `jsonb` stores object keys sorted by length
 * then bytewise, so an ingredient that has been through Supabase comes back as
 * {name, unit, notes, quantity, …} while the parser emits {name, quantity,
 * unit, …}. Identical data, different string — which made every synced recipe
 * look changed on every press, rewriting the whole collection and pushing it
 * back with a fresh updatedAt. Under last-write-wins that would also let a
 * press quietly beat a genuinely newer edit made on another device.
 */
function sameIngredients(a: Ingredient[], b: Ingredient[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, i) => INGREDIENT_FIELDS.every((key) => left[key] === b[i][key]));
}

/**
 * Re-reads every saved recipe's ingredient lines with the current parser.
 *
 * Parsing happens once, when a recipe is imported or saved, and the result is
 * what the shopping list is built from — so improving the parser does nothing
 * for recipes already in the collection. This is the catch-up.
 *
 * It's lossless because `originalString` is kept verbatim on every ingredient:
 * the raw line the recipe actually had is always still there to re-read. That
 * also makes it idempotent — running it twice changes nothing the second time.
 *
 * Ingredients marked `parsedBy: 'api'` are left alone. Their amount came from
 * a source that reads these lines better than we do, and re-reading it here
 * would be a downgrade dressed up as an improvement.
 *
 * Returns how many recipes actually changed, so the UI can say something true
 * rather than "done".
 */
export function reparseAllRecipes(): number {
  const all = Object.values(useRecipeStore.getState().recipes);
  const corrections = indexCorrections(useCorrectionStore.getState().corrections);
  const updated: Recipe[] = [];

  for (const recipe of all) {
    // Nothing to re-read from. Recipes are only ever built by the parser, so
    // this shouldn't happen — but rewriting a recipe's ingredients from a
    // guess would be a bad way to find out.
    if (!recipe.ingredients.every((i) => i.originalString?.trim())) continue;

    // Line by line rather than all at once, so an ingredient the source had
    // already parsed keeps its amount instead of being replaced by our
    // reading of the same string. Still one line in, at most one out —
    // parseIngredientLines drops a line that names nothing.
    const reparsed = recipe.ingredients.flatMap((ing) =>
      // A correction outranks even the API's own parse. Someone looked at the
      // row and said it was wrong; that is the most reliable signal there is.
      ing.parsedBy === 'api'
        ? [applyCorrection(ing, corrections)]
        : parseIngredientLines([ing.originalString], corrections),
    );
    if (sameIngredients(reparsed, recipe.ingredients)) continue;

    updated.push({ ...recipe, ingredients: reparsed, updatedAt: new Date().toISOString() });
  }

  if (updated.length === 0) return 0;
  for (const recipe of updated) {
    useRecipeStore.getState().updateRecipe(recipe);
    void pushRecipe(recipe);
  }
  // The list is derived from these, so it has to be rebuilt — this is the
  // whole visible point of the exercise.
  regenerateShoppingList();
  return updated.length;
}

// --- Corrections ---

/**
 * Records that the parser got a line wrong, and fixes it immediately.
 *
 * "Immediately" is the whole point. Parsing happens once, at import, so a new
 * rule normally does nothing for recipes already saved — that's what the
 * Settings button exists to undo. A correction has to be different: you told
 * the app it was wrong, and the row has to change while you're looking at it.
 *
 * So this re-reads every recipe against the new correction and rebuilds the
 * list, exactly as `reparseAllRecipes` does. That's a whole-collection pass
 * for one correction, which is the right trade at the size a person's recipe
 * box actually reaches, and it means a correction can never half-apply.
 *
 * Returns how many recipes changed.
 */
export function saveCorrection(correction: Correction): number {
  useCorrectionStore.getState().addCorrection(correction);
  return reparseAllRecipes();
}

/**
 * Offers a correction up for review, or takes the offer back.
 *
 * Sharing is a second, separate act from correcting. The fix already happened
 * locally and stays whether this is on or off; this is only about whether a
 * maintainer gets to see the line and decide it belongs in the shipped
 * vocabulary. Off by default, on every correction, because a correction is
 * about a recipe somebody is cooking.
 *
 * Signed out it stores the intent and sends nothing — there's nowhere to send
 * it, and quietly dropping the toggle would be worse than remembering it.
 */
export async function shareCorrection(id: string, share: boolean): Promise<void> {
  useCorrectionStore.getState().setShare(id, share);
  if (!share) return;

  const correction = useCorrectionStore.getState().corrections.find((c) => c.id === id);
  if (!correction || correction.submittedAt) return;
  if (await pushParserReport(correction)) {
    useCorrectionStore.getState().markSubmitted([id], new Date().toISOString());
  }
}

/**
 * Withdraws a correction and lets the parser have its own answer back.
 *
 * The undo path matters as much as the apply path: a correction made in haste
 * is otherwise permanent, and nobody trusts a button they can't take back.
 */
export function withdrawCorrection(id: string): number {
  useCorrectionStore.getState().removeCorrection(id);
  return reparseAllRecipes();
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

/**
 * Records that a recipe was actually cooked, right now. The one place the app
 * learns something no amount of planning tells it: what you really eat.
 */
export function logCook(id: string, at: Date = new Date()): void {
  const recipe = useRecipeStore.getState().recipes[id];
  if (!recipe) return;
  const stamped: Recipe = {
    ...recipe,
    cookedAt: appendCook(recipe.cookedAt, at.toISOString()),
    updatedAt: new Date().toISOString(),
  };
  useRecipeStore.getState().updateRecipe(stamped);
  void pushRecipe(stamped);
}

/** Undoes the most recent cook — for the inevitable mis-tap. */
export function undoLastCook(id: string): void {
  const recipe = useRecipeStore.getState().recipes[id];
  if (!recipe || !recipe.cookedAt?.length) return;
  const remaining = removeLastCook(recipe.cookedAt);
  const stamped: Recipe = {
    ...recipe,
    cookedAt: remaining.length > 0 ? remaining : undefined,
    updatedAt: new Date().toISOString(),
  };
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

export function generatePlan(
  days: number,
  mealTypes: MealType[],
  /**
   * An object rather than two more positional arguments: `startDate` and
   * `seed` are both optional and neither is obviously first, which is exactly
   * the shape that ends up with a date passed as a seed one day.
   */
  options: { startDate?: string; seed?: number } = {},
): void {
  const { plan: existing, config: existingConfig } = usePlanStore.getState();
  const drawn: MealPlanConfig = {
    days,
    mealTypes,
    seed: options.seed ?? newSeed(),
    startDate: options.startDate,
  };

  // Read ids straight from the source of truth. (An earlier cache optimization
  // broke this: the cache isn't persisted, so after a fresh page load it was
  // empty and every generated slot came out unfilled.)
  const recipes = useRecipeStore.getState().recipes;
  const recipeIds = Object.keys(recipes);
  const block = generateMealPlan(
    recipeIds,
    drawn,
    // generateMealPlan has always accepted a start date and defaulted it to
    // today; nothing ever passed one.
    drawn.startDate ? fromLocalDateString(drawn.startDate) : undefined,
    (id, type) => {
      const recipe = recipes[id];
      return !recipe || recipeFitsMealType(recipe, type);
    },
    (id) => recipes[id]?.mainIngredient?.trim().toLowerCase() || undefined,
  );

  const { plan, config } = appendOrReplace(existing, existingConfig, block, drawn);
  usePlanStore.getState().setPlan(config, plan);
  regenerateShoppingList();
  const { config: stampedConfig, plan: stampedPlan } = usePlanStore.getState();
  if (stampedConfig && stampedPlan) void pushMealPlan(stampedConfig, stampedPlan);
}

/**
 * Decides whether a freshly drawn block extends the current plan or replaces
 * it, and works out what the config should say either way.
 *
 * A block that begins after the last day already planned is next week, so it
 * is added; anything else overlaps days that already exist, and two meals
 * claiming one date is a different feature. Kept separate from generatePlan —
 * and pure — because it's all boundary conditions and no drawing.
 *
 * The rules that matter:
 *  - `days` follows the block just drawn, because the only thing reading it
 *    is the generator form's default. `plan.length` is what anything wanting
 *    the plan's real length uses.
 *  - `startDate` stays with the plan's first day, so it keeps describing the
 *    plan rather than the most recent addition to it.
 *  - `shoppingThrough` does not move on an append. That is the point of this:
 *    next week goes on the plan without going on the shopping list. On a
 *    replace it covers the whole new plan, which is what generating has
 *    always done.
 */
export function appendOrReplace(
  existing: MealPlanDay[] | null,
  existingConfig: MealPlanConfig | null,
  block: MealPlanDay[],
  drawn: MealPlanConfig,
): { plan: MealPlanDay[]; config: MealPlanConfig } {
  const lastPlanned = existing?.length ? existing[existing.length - 1].date : undefined;
  const appends = !!lastPlanned && !!block.length && block[0].date > lastPlanned;

  if (!appends) {
    return {
      plan: block,
      config: { ...drawn, shoppingThrough: block[block.length - 1]?.date },
    };
  }

  return {
    plan: [...existing!, ...block],
    config: {
      ...drawn,
      startDate: existingConfig?.startDate,
      // A plan made before horizons existed has none, and "no horizon" means
      // "shop the lot" — which would quietly pull the new week onto the list.
      // Pin it to where the plan ended before this block arrived.
      shoppingThrough: existingConfig?.shoppingThrough ?? lastPlanned,
    },
  };
}

/**
 * Moves the shopping horizon, putting more of the plan on the list.
 *
 * Separate from generating, because deciding to shop for a week is a separate
 * decision from deciding to eat it.
 */
export function setShoppingHorizon(through: string): void {
  const { config, plan } = usePlanStore.getState();
  if (!config || !plan) return;
  usePlanStore.getState().setPlan({ ...config, shoppingThrough: through }, plan);
  regenerateShoppingList();
  const { config: stamped, plan: stampedPlan } = usePlanStore.getState();
  if (stamped && stampedPlan) void pushMealPlan(stamped, stampedPlan);
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
  usePlanStore.getState().addMeal(dayIndex, { type, recipeId: '', id: nanoid() });
  const day = usePlanStore.getState().plan?.[dayIndex];
  if (day) void pushMealPlanDay(dayIndex, day);
}

/**
 * Moves a meal to a new position — reordering within one day, or dragging it
 * onto another day entirely. Order has no effect on the shopping list (same
 * recipes/scales either way), so this only touches the plan, not aggregation.
 */
export function moveMealSlot(
  fromDayIndex: number,
  fromMealIndex: number,
  toDayIndex: number,
  toMealIndex: number,
): void {
  usePlanStore.getState().moveMeal(fromDayIndex, fromMealIndex, toDayIndex, toMealIndex);
  const plan = usePlanStore.getState().plan;
  if (!plan) return;
  void pushMealPlanDay(fromDayIndex, plan[fromDayIndex]);
  if (toDayIndex !== fromDayIndex) void pushMealPlanDay(toDayIndex, plan[toDayIndex]);
}

/**
 * Backfills a stable id on any slot that predates drag-and-drop (persisted
 * before this field existed). Only touches days that actually need it, and
 * is a no-op — no store write, no sync push — once every slot already has one.
 */
export function ensureMealIds(): void {
  const { plan } = usePlanStore.getState();
  if (!plan) return;
  let touchedAny = false;
  const touchedDays: number[] = [];
  const next = plan.map((day, dayIndex) => {
    if (day.meals.every((m) => m.id)) return day;
    touchedAny = true;
    touchedDays.push(dayIndex);
    return {
      ...day,
      updatedAt: new Date().toISOString(),
      meals: day.meals.map((m) => (m.id ? m : { ...m, id: nanoid() })),
    };
  });
  if (!touchedAny) return;
  for (const dayIndex of touchedDays) {
    usePlanStore.getState().setDay(dayIndex, next[dayIndex]);
    void pushMealPlanDay(dayIndex, next[dayIndex]);
  }
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
  // Item ids are derived from content, so clearing the list locally doesn't
  // orphan anything on the server — the same ids reappear and the next pull
  // hands back the checks and edits this was meant to throw away.
  void clearShoppingItemStatesRemote();
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
  void clearShoppingItemStatesRemote();
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
    if (typeof r !== 'object' || r === null) return false;
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
