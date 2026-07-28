// --- Recipe Domain ---

export interface Ingredient {
  /** Normalized ingredient name (e.g., 'onion') */
  name: string;
  /** Numerical quantity, parsed. 0 means "no quantity" (e.g., "salt to taste"). */
  quantity: number;
  /** Unit string (e.g., 'cup', 'g', 'tbsp', '') */
  unit: string;
  /** The original ingredient text exactly as written in the recipe */
  originalString: string;
  /** Optional notes (e.g., 'diced') extracted from original string */
  notes?: string;
  /**
   * What the recipe said instead of an amount — "to taste", "for garnish".
   * Only set when there is no quantity, and shown in the shopping list where
   * the number would have been.
   */
  qualifier?: string;
  /**
   * Set when the amount came from a source that had already parsed it (the
   * Spoonacular API) rather than from our own reading of `originalString`.
   *
   * The name is normalized by us either way — bucketing has to use one
   * vocabulary — but the quantity and unit are theirs, and re-reading the raw
   * line with our parser would replace a better answer with a worse one. See
   * `reparseAllRecipes`.
   */
  parsedBy?: 'api';
}

export interface Recipe {
  id: string; // nanoid
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  ingredients: Ingredient[];
  instructions: string[]; // each step as a string
  dateAdded: string; // ISO 8601
  /**
   * Which meals this recipe suits (breakfast/lunch/dinner/snack). Undefined
   * or empty means "fits anywhere" — every recipe saved before this field
   * existed has no tags, and generation treats that as unrestricted rather
   * than excluding untagged recipes everywhere.
   */
  mealTypes?: MealType[];
  /** Free-text browsing category, e.g. "Soup", "Salad", "Dessert". */
  category?: string;
  /** Free-text primary protein/ingredient, e.g. "chicken", "ground beef" — lets plan generation space out repeats. */
  mainIngredient?: string;
  /** Total time to make, in minutes. */
  cookTimeMinutes?: number;
  /** How many servings the recipe yields as written — the base a plan slot's servings stepper scales against. */
  servings?: number;
  /** 0.5–5 in half-star steps. Undefined means unrated (never fewer than 0.5 — there's no "0 star" rating). */
  rating?: number;
  /** Free-text notes the user keeps on the recipe (tweaks, verdicts, substitutions) — not part of the recipe itself. */
  notes?: string;
  /**
   * ISO timestamps of every time this was actually cooked, ascending. The
   * app's only record of an *event* rather than intent or inventory — see
   * `src/lib/cook-log.ts`. Absent on every recipe saved before the cook log
   * existed, which reads correctly as "never made".
   */
  cookedAt?: string[];
  /** Set on every local edit; compared against the server's row to resolve sync conflicts. Absent until the record has synced at least once. */
  updatedAt?: string;
}

// --- Meal Plan Domain ---

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'];

export interface MealSlot {
  type: MealType;
  /** Empty string means the slot is unfilled. */
  recipeId: string;
  /**
   * Stable identity for drag-and-drop — array position isn't stable enough
   * on its own since reordering is exactly what changes it. Optional only
   * because slots persisted before drag-and-drop existed don't have one yet;
   * ensureMealIds() in actions.ts backfills those the first time a plan with
   * missing ids loads.
   */
  id?: string;
  /** Pinned slots survive "shuffle" untouched — only unpinned slots re-roll. */
  pinned?: boolean;
  /**
   * Ingredient multiplier for this one meal (1 = as written). Shown as
   * "Serves N" when the recipe declares base servings, "×1.5" otherwise;
   * the shopping list multiplies this meal's ingredient quantities by it.
   */
  scale?: number;
}

export interface MealPlanDay {
  date: string; // YYYY-MM-DD, date of the planned day
  meals: MealSlot[];
  /** Set whenever this day's slots change (regenerate, swap, shuffle); compared to the server's row to resolve sync conflicts per day. */
  updatedAt?: string;
}

export interface MealPlanConfig {
  days: number;
  mealTypes: MealType[];
  seed: number;
  /**
   * Local YYYY-MM-DD the plan's first day falls on, so you can plan next week
   * while this one is still running.
   *
   * Optional, and absent means today — plans saved before this existed all
   * started on the day they were generated, which is what that default says.
   */
  startDate?: string;
  /**
   * Local YYYY-MM-DD of the last day the shopping list covers.
   *
   * A plan can run further ahead than you want to shop for: generating next
   * week appends it and leaves this where it was, so the list keeps
   * describing this week's shop until you move it forward.
   *
   * Absent means the whole plan, which is what every plan made before this
   * existed was doing.
   */
  shoppingThrough?: string;
  /** Set on every regenerate; compared to the server's row to resolve sync conflicts. */
  updatedAt?: string;
}

/** A meal plan saved to history so it can be looked back on or restored. */
export interface ArchivedPlan {
  id: string; // nanoid
  archivedAt: string; // ISO 8601
  /** Human-readable summary, e.g. "3 days · Jul 7–9 · Dinner". */
  label: string;
  config: MealPlanConfig;
  plan: MealPlanDay[];
}

// --- Shopping List Domain ---

export interface ShoppingListItem {
  /** Stable key: normalized name + final unit */
  id: string;
  ingredientName: string; // display name
  totalQuantity: number;
  unit: string;
  checked: boolean;
  /** If manually edited, the override string shown instead of quantity+name */
  manualOverride?: string;
  /**
   * Stands in for the amount when there isn't one — "to taste". Carried up
   * from the ingredients that merged into this row; only meaningful when
   * `totalQuantity` is 0.
   */
  qualifier?: string;
  /** Ids of the recipes that contributed to this line item (for "show source recipe" links). */
  recipeIds?: string[];
  /** Distinct original ingredient lines merged into this total (only set when a merge actually combined 2+ different phrasings), for a "why this many" breakdown. */
  sources?: { originalString: string; recipeId?: string; scale?: number }[];
  /** Set on every local checked/manualOverride edit; compared against the server's row to resolve sync conflicts. */
  updatedAt?: string;
}

// --- Parse API contracts ---

export interface ParsedRecipeData {
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  /** Raw ingredient lines as written on the page */
  ingredientLines: string[];
  /**
   * Already-parsed ingredients, when the source provided them. Only
   * Spoonacular does; a scraped page and a paste both give us strings and
   * nothing else, so this is absent and `ingredientLines` gets parsed.
   */
  ingredients?: Ingredient[];
  instructions: string[];
}

export type ParseResult =
  | { status: 'success'; url: string; data: ParsedRecipeData; via: 'scraper' | 'ai' }
  | { status: 'error'; url: string; message: string };

// --- Export / Import ---

/**
 * Bump whenever ExportBundle's shape changes in a way `migrateBundle` (in
 * actions.ts) needs to handle — e.g. a field is renamed, restructured, or
 * made non-optional. Purely additive optional fields (like `archivedPlans`
 * below) don't strictly need a bump, but adding a migration case anyway
 * keeps old backups importing with sensible defaults instead of `undefined`.
 */
export const CURRENT_BUNDLE_VERSION = 1;

export interface ExportBundle {
  version: number;
  exportedAt: string;
  recipes: Record<string, Recipe>;
  mealPlan: MealPlanDay[] | null;
  mealPlanConfig: MealPlanConfig | null;
  shoppingList: ShoppingListItem[];
  /** Optional (added later); older backups won't have it. */
  archivedPlans?: ArchivedPlan[];
  /** Normalized ingredient names the user already has on hand ("spice rack"), excluded from the shopping list. Optional (added later). */
  pantryStaples?: string[];
}
