import type { Recipe } from './types';
import { MEAL_TYPE_LABELS } from './plan';

/**
 * What a recipe is filed under — the eyebrow above the title on a card and on
 * the opened sheet.
 *
 * Falls back to an empty string, never to the word "Recipe". A box where every
 * uncategorised card is labelled RECIPE tells you nothing and reads as a
 * placeholder someone forgot to fill in; blank is the honest answer.
 *
 * Shared rather than computed on each surface because it already diverged
 * once: the card was fixed to return '' and the sheet was written later with
 * a 'Recipe' fallback, reintroducing the same bug on a different page.
 */
export function filedAs(recipe: Pick<Recipe, 'category' | 'mealTypes'>): string {
  if (recipe.category) return recipe.category;
  const firstMeal = recipe.mealTypes?.[0];
  return firstMeal ? MEAL_TYPE_LABELS[firstMeal] : '';
}
