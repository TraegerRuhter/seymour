import type { MealPlanConfig, MealPlanDay, MealSlot, MealType, Recipe } from './types';

/**
 * Whether a recipe suits a given meal slot. Untagged recipes (no mealTypes,
 * or an empty list — every recipe saved before this field existed) fit
 * anywhere, so tagging is opt-in and never silently excludes old recipes.
 */
export function recipeFitsMealType(recipe: Recipe, type: MealType): boolean {
  return !recipe.mealTypes || recipe.mealTypes.length === 0 || recipe.mealTypes.includes(type);
}

/** Deterministic PRNG (mulberry32). Same seed → same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle driven by a seeded PRNG. Does not mutate the input. */
export function seededShuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Local (not UTC) YYYY-MM-DD — the format plan days are keyed by and compared against "today". */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Generates a meal plan from the recipe collection.
 *
 * Recipes are drawn from a seeded shuffle, day by day. Within a single day no
 * recipe repeats; when the shuffled deck runs out it is reshuffled and reused,
 * so repeats across different days are allowed. If the collection is smaller
 * than the number of meals in one day, within-day uniqueness is kept as long
 * as possible and only then relaxed (rather than leaving slots empty).
 *
 * `isEligible(recipeId, type)`, if given, restricts each meal type's deck to
 * the recipes eligible for it (e.g. tagged "dinner", or untagged and so
 * eligible everywhere) — every distinct meal type in `config.mealTypes` gets
 * its own independently shuffled deck rather than one shared across types,
 * so a type-restricted collection doesn't starve. If eligibility leaves zero
 * candidates for a type (e.g. every recipe is tagged but none for
 * "breakfast"), that type quietly falls back to the full collection rather
 * than leaving slots empty — an incomplete taxonomy should degrade, not break
 * generation.
 *
 * `getMainIngredient(recipeId)`, if given, adds a variety preference: each
 * meal type avoids repeating the previous day's main ingredient for that
 * same type (so dinner doesn't draw ground-beef recipes two nights running).
 * It's a soft preference, not a hard rule — if no untagged-or-varied
 * candidate turns up within a deck's length of scanning, the draw falls back
 * to whatever it would have picked without this option, so a collection
 * that's scarce or homogeneous in main ingredients never leaves a slot
 * unfilled.
 */
export function generateMealPlan(
  recipeIds: string[],
  config: MealPlanConfig,
  startDate: Date = new Date(),
  isEligible?: (recipeId: string, type: MealType) => boolean,
  getMainIngredient?: (recipeId: string) => string | undefined,
): MealPlanDay[] {
  const rand = mulberry32(config.seed);
  const days: MealPlanDay[] = [];
  if (recipeIds.length === 0) {
    for (let d = 0; d < config.days; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + d);
      days.push({
        date: toLocalDateString(date),
        meals: config.mealTypes.map((type): MealSlot => ({ type, recipeId: '' })),
      });
    }
    return days;
  }

  // One deck per distinct meal type in this plan, each an independent shuffled
  // stream over that type's eligible pool (persisting across days, same as the
  // single shared deck used to).
  const decks = new Map<MealType, { ids: string[]; pos: number }>();
  for (const type of config.mealTypes) {
    if (decks.has(type)) continue;
    const eligible = isEligible ? recipeIds.filter((id) => isEligible(id, type)) : recipeIds;
    const pool = eligible.length > 0 ? eligible : recipeIds;
    decks.set(type, { ids: seededShuffle(pool, rand), pos: 0 });
  }

  const lastMainIngredientByType = new Map<MealType, string>();

  const draw = (type: MealType, usedToday: Set<string>): string => {
    const deck = decks.get(type)!;
    const lastIngredient = getMainIngredient ? lastMainIngredientByType.get(type) : undefined;
    // First pass: find the next not-used-today card, preferring one that
    // doesn't repeat yesterday's main ingredient for this type.
    let fallback: string | undefined;
    for (let attempts = 0; attempts < deck.ids.length; attempts++) {
      if (deck.pos >= deck.ids.length) {
        deck.ids = seededShuffle(deck.ids, rand);
        deck.pos = 0;
      }
      const candidate = deck.ids[deck.pos];
      deck.pos++;
      if (usedToday.has(candidate)) continue;
      const repeatsIngredient = lastIngredient && getMainIngredient?.(candidate) === lastIngredient;
      if (!repeatsIngredient) return candidate;
      if (fallback === undefined) fallback = candidate;
    }
    if (fallback !== undefined) return fallback;
    // Collection smaller than meals-per-day: allow a within-day repeat.
    if (deck.pos >= deck.ids.length) {
      deck.ids = seededShuffle(deck.ids, rand);
      deck.pos = 0;
    }
    return deck.ids[deck.pos++];
  };

  for (let d = 0; d < config.days; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const usedToday = new Set<string>();
    const meals: MealSlot[] = config.mealTypes.map((type) => {
      const recipeId = draw(type, usedToday);
      usedToday.add(recipeId);
      const ingredient = getMainIngredient?.(recipeId);
      if (ingredient) lastMainIngredientByType.set(type, ingredient);
      else lastMainIngredientByType.delete(type);
      return { type, recipeId };
    });
    days.push({ date: toLocalDateString(date), meals });
  }
  return days;
}

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};


function formatMonthDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Human summary of a plan for the archive list, e.g. "3 days · Jul 7–9 · Dinner". */
export function planLabel(plan: MealPlanDay[], config: MealPlanConfig): string {
  const dayCount = `${plan.length} day${plan.length === 1 ? '' : 's'}`;
  const dates =
    plan.length === 0
      ? ''
      : plan.length === 1
        ? formatMonthDay(plan[0].date)
        : `${formatMonthDay(plan[0].date)}–${formatMonthDay(plan[plan.length - 1].date)}`;
  const meals = config.mealTypes.map((t) => MEAL_TYPE_LABELS[t]).join(', ');
  return [dayCount, dates, meals].filter(Boolean).join(' · ');
}
