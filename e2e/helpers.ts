import type { Page } from '@playwright/test';

export interface RecipeInput {
  title: string;
  ingredients: string[];
  instructions?: string[];
  mealTypes?: Array<'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Dessert'>;
}

/**
 * Fills out and submits the manual "Add a recipe" form. Manual entry is used
 * throughout the e2e suite (rather than URL import or Discover) so tests
 * don't depend on network access or third-party API keys — the form is the
 * one recipe-creation path that's fully self-contained.
 */
export async function addRecipeManually(page: Page, recipe: RecipeInput) {
  await page.goto('/add?mode=manual');
  await page.getByLabel('Title').fill(recipe.title);
  await page.getByLabel(/Ingredients/).fill(recipe.ingredients.join('\n'));
  if (recipe.instructions?.length) {
    await page.getByLabel(/Instructions/).fill(recipe.instructions.join('\n'));
  }
  for (const label of recipe.mealTypes ?? []) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.waitForURL(/\/recipes\/.+/);
}
