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

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  recipes: Record<string, Recipe>;
  mealPlan: MealPlanDay[] | null;
  mealPlanConfig: MealPlanConfig | null;
  shoppingList: ShoppingListItem[];
  /** Optional (added later); older backups won't have it. */
  archivedPlans?: ArchivedPlan[];
}
