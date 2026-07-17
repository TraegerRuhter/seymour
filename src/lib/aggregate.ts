import type { Ingredient, MealPlanDay, Recipe, ShoppingListItem } from './types';
import { toBase, toReadable, roundUpTo, type UnitSystem } from './units';
import { PRODUCE_YIELDS } from './produce-yields';

interface Bucket {
  name: string;
  /** '' for unitless counts; 'ml'/'g' for convertible; raw unit otherwise */
  key: string;
  baseUnit: 'ml' | 'g' | null;
  displayUnit: string;
  total: number;
  recipeIds: Set<string>;
  /** Every original line that fed into this bucket, for the "why this many" breakdown. */
  sources: { originalString: string; recipeId?: string; scale?: number }[];
  /**
   * For produce with a known "cup of prepped X ≈ N whole pieces" yield
   * (see produce-yields.ts): prepped-volume contributions ("1 cup chopped
   * onion") accumulate here in mL, converted to an equivalent piece count
   * once at output time and added to any literal whole-piece counts already
   * in `total` — nobody buys a cup of onion at the store.
   */
  produceMl: number;
}

/** An ingredient tagged with the recipe it came from, for "source recipe" links. */
export interface SourcedIngredient extends Ingredient {
  recipeId?: string;
  /** The plan slot's servings multiplier this line arrived with (1 = as written). */
  scale?: number;
}

/**
 * The aggregation engine: feeds every ingredient from every planned meal
 * through normalization + unit conversion and sums like items.
 *
 * Grouping key = normalized name + comparable unit. Convertible volume/weight
 * units collapse into a single base-unit bucket per name; non-convertible
 * units ("clove", "pinch") stay separate so unlike things are never summed.
 */
export function aggregateIngredients(
  ingredients: SourcedIngredient[],
  system: UnitSystem = 'imperial',
): ShoppingListItem[] {
  const buckets = new Map<string, Bucket>();

  for (const ing of ingredients) {
    const name = ing.name;
    if (!name) continue;

    const yieldInfo = PRODUCE_YIELDS[name];
    // A slot's servings multiplier scales this line's quantity before any
    // unit conversion; unquantified lines ("salt to taste") stay as-is.
    const scale = ing.scale ?? 1;
    const quantity = ing.quantity * scale;

    let key: string;
    let baseUnit: 'ml' | 'g' | null = null;
    let displayUnit = ing.unit;
    let amount = quantity;
    let volumeMl = 0;

    if (quantity > 0 && ing.unit) {
      const converted = toBase(quantity, ing.unit);
      if (yieldInfo && converted && converted.baseUnit === 'ml') {
        // Route a prepped-volume line ("1 cup chopped onion") into the same
        // bucket as a whole-piece count ("2 onions") for this ingredient.
        key = `${name}|${yieldInfo.pieceUnit}`;
        displayUnit = yieldInfo.pieceUnit;
        amount = 0;
        volumeMl = converted.quantity;
      } else if (converted) {
        baseUnit = converted.baseUnit;
        amount = converted.quantity;
        key = `${name}|${converted.baseUnit}`;
      } else {
        // non-convertible unit: only sum with identical units
        key = `${name}|${ing.unit}`;
      }
    } else {
      // unitless count ("2 eggs") or unquantified ("salt to taste")
      key = `${name}|`;
      displayUnit = '';
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        name,
        key,
        baseUnit,
        displayUnit,
        total: 0,
        recipeIds: new Set(),
        sources: [],
        produceMl: 0,
      };
      buckets.set(key, bucket);
    }
    if (amount > 0) bucket.total += amount;
    if (volumeMl > 0) bucket.produceMl += volumeMl;
    if (ing.recipeId) bucket.recipeIds.add(ing.recipeId);
    bucket.sources.push({
      originalString: ing.originalString,
      recipeId: ing.recipeId,
      ...(scale !== 1 ? { scale } : {}),
    });
  }

  const items: ShoppingListItem[] = [];
  for (const bucket of buckets.values()) {
    let quantity = bucket.total;
    let unit = bucket.displayUnit;
    const yieldInfo = PRODUCE_YIELDS[bucket.name];
    if (yieldInfo && bucket.produceMl > 0) {
      const equivalentPieces = bucket.produceMl / yieldInfo.mlPerPiece;
      quantity = roundUpTo(bucket.total + equivalentPieces, 1);
      unit = yieldInfo.pieceUnit;
    } else if (bucket.baseUnit && bucket.total > 0) {
      const readable = toReadable(bucket.total, bucket.baseUnit, system);
      quantity = readable.quantity;
      unit = readable.unit;
    }
    // Only worth showing a "why this many" breakdown when the merge
    // actually combined two differently-worded lines — a bucket built from
    // one recipe's line repeated across several planned meals has nothing
    // to explain.
    const distinctSources = [
      ...new Map(bucket.sources.map((s) => [`${s.originalString}|${s.scale ?? 1}`, s])).values(),
    ];
    items.push({
      id: bucket.key,
      ingredientName: bucket.name,
      totalQuantity: quantity,
      unit,
      checked: false,
      ...(bucket.recipeIds.size > 0 ? { recipeIds: [...bucket.recipeIds].sort() } : {}),
      ...(distinctSources.length > 1 ? { sources: distinctSources } : {}),
    });
  }

  // Stable, friendly ordering: alphabetical by name, then by unit.
  items.sort((a, b) =>
    a.ingredientName === b.ingredientName
      ? a.unit.localeCompare(b.unit)
      : a.ingredientName.localeCompare(b.ingredientName),
  );
  return items;
}

/**
 * Collects every ingredient from the recipes referenced by a meal plan
 * (a recipe planned twice contributes twice) and aggregates them.
 *
 * `staples`, if given, is a set of normalized ingredient names (see
 * `normalizeIngredientName`) the user already has on hand — a "spice rack" —
 * and are excluded from the list entirely rather than shown as an item to
 * buy.
 */
export function buildShoppingList(
  plan: MealPlanDay[] | null,
  recipes: Record<string, Recipe>,
  system: UnitSystem = 'imperial',
  staples?: ReadonlySet<string>,
): ShoppingListItem[] {
  if (!plan) return [];
  const all: SourcedIngredient[] = [];
  for (const day of plan) {
    for (const slot of day.meals) {
      const recipe = slot.recipeId ? recipes[slot.recipeId] : undefined;
      if (!recipe) continue;
      const scale = slot.scale ?? 1;
      all.push(
        ...recipe.ingredients.map((ing) => ({
          ...ing,
          recipeId: recipe.id,
          ...(scale !== 1 ? { scale } : {}),
        })),
      );
    }
  }
  const filtered = staples && staples.size > 0 ? all.filter((i) => !staples.has(i.name)) : all;
  return aggregateIngredients(filtered, system);
}

/**
 * Re-aggregates while carrying over user state (checked flags and manual
 * overrides) from the previous list, matched by stable item id.
 */
export function mergeShoppingList(
  next: ShoppingListItem[],
  previous: ShoppingListItem[],
): ShoppingListItem[] {
  const prevById = new Map(previous.map((i) => [i.id, i]));
  return next.map((item) => {
    const prev = prevById.get(item.id);
    if (!prev) return item;
    return {
      ...item,
      checked: prev.checked,
      ...(prev.manualOverride ? { manualOverride: prev.manualOverride } : {}),
    };
  });
}
