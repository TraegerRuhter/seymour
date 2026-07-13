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
  /** Set on every local edit; compared against the server's row to resolve sync conflicts. Absent until the record has synced at least once. */
  updatedAt?: string;
}

// --- Meal Plan Domain ---

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface MealSlot {
  type: MealType;
  /** Empty string means the slot is unfilled. */
  recipeId: string;
}

export interface MealPlanDay {
  date: string; // YYYY-MM-DD, date of the planned day
  meals: MealSlot[];
}

export interface MealPlanConfig {
  days: number;
  mealTypes: MealType[];
  seed: number;
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
  /** Ids of the recipes that contributed to this line item (for "show source recipe" links). */
  recipeIds?: string[];
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
