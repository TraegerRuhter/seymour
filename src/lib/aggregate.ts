import type { Ingredient, MealPlanDay, Recipe, ShoppingListItem } from './types';
import { toBase, toReadable, unitKind, type UnitSystem } from './units';

interface Bucket {
  name: string;
  /** '' for unitless counts; 'ml'/'g' for convertible; raw unit otherwise */
  key: string;
  baseUnit: 'ml' | 'g' | null;
  displayUnit: string;
  total: number;
  /** true when at least one contribution had no parseable quantity */
  hasUnquantified: boolean;
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
  ingredients: Ingredient[],
  system: UnitSystem = 'imperial',
): ShoppingListItem[] {
  const buckets = new Map<string, Bucket>();

  for (const ing of ingredients) {
    const name = ing.name;
    if (!name) continue;

    let key: string;
    let baseUnit: 'ml' | 'g' | null = null;
    let displayUnit = ing.unit;
    let amount = ing.quantity;

    if (ing.quantity > 0 && ing.unit) {
      const converted = toBase(ing.quantity, ing.unit);
      if (converted) {
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
      bucket = { name, key, baseUnit, displayUnit, total: 0, hasUnquantified: false };
      buckets.set(key, bucket);
    }
    if (amount > 0) bucket.total += amount;
    else bucket.hasUnquantified = true;
  }

  const items: ShoppingListItem[] = [];
  for (const bucket of buckets.values()) {
    let quantity = bucket.total;
    let unit = bucket.displayUnit;
    if (bucket.baseUnit && bucket.total > 0) {
      const readable = toReadable(bucket.total, bucket.baseUnit, system);
      quantity = readable.quantity;
      unit = readable.unit;
    }
    items.push({
      id: bucket.key,
      ingredientName: bucket.name,
      totalQuantity: quantity,
      unit,
      checked: false,
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
  const all: Ingredient[] = [];
  for (const day of plan) {
    for (const slot of day.meals) {
      const recipe = slot.recipeId ? recipes[slot.recipeId] : undefined;
      if (recipe) all.push(...recipe.ingredients);
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

export { unitKind };