import { test, expect } from '@playwright/test';
import { addRecipeManually } from './helpers';

test.describe('Recipes', () => {
  test('adding a recipe manually shows it in the library', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs', '2 tbsp curry powder', '1 cup coconut milk'],
      instructions: ['Cook the chicken.', 'Add the curry powder and coconut milk.'],
      mealTypes: ['Dinner'],
    });

    await expect(page.getByRole('heading', { name: 'Weeknight Chicken Curry' })).toBeVisible();

    await page.goto('/recipes');
    await expect(page.getByRole('link', { name: /Weeknight Chicken Curry/ })).toBeVisible();
  });

  test('an empty library shows an empty state instead of a blank page', async ({ page }) => {
    await page.goto('/recipes');
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Weeknight Chicken Curry/ })).toHaveCount(0);
  });

  test('the manual form rejects a title with no ingredients', async ({ page }) => {
    await page.goto('/add?mode=manual');
    await page.getByLabel('Title').fill('Empty Recipe');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    // Scoped to the form's own <p role="alert">: Next's route announcer
    // (#__next-route-announcer__) also has role="alert" and would otherwise
    // make this locator ambiguous.
    await expect(page.locator('p[role="alert"]')).toHaveText(/at least one ingredient/i);
    await expect(page).toHaveURL(/\/add/);
  });

  test('search filters the recipe library by title', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });
    await addRecipeManually(page, {
      title: 'Blueberry Pancakes',
      ingredients: ['1 cup flour', '1 cup blueberries'],
      mealTypes: ['Breakfast'],
    });

    await page.goto('/recipes');
    await expect(page.getByRole('link', { name: /Weeknight Chicken Curry/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Blueberry Pancakes/ })).toBeVisible();

    await page.getByLabel('Search recipes').fill('pancakes');
    await expect(page.getByRole('link', { name: /Blueberry Pancakes/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Weeknight Chicken Curry/ })).toHaveCount(0);
  });

  test('meal-type filter chips narrow the library to matching recipes', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });
    await addRecipeManually(page, {
      title: 'Blueberry Pancakes',
      ingredients: ['1 cup flour'],
      mealTypes: ['Breakfast'],
    });

    await page.goto('/recipes');
    await page.getByRole('button', { name: 'Breakfast', exact: true }).click();
    await expect(page.getByRole('link', { name: /Blueberry Pancakes/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Weeknight Chicken Curry/ })).toHaveCount(0);
  });

  test('editing a recipe persists the change', async ({ page }) => {
    await addRecipeManually(page, {
      title: 'Weeknight Chicken Curry',
      ingredients: ['1 lb chicken thighs'],
      mealTypes: ['Dinner'],
    });

    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill('Weeknight Chicken Curry (Updated)');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(
      page.getByRole('heading', { name: 'Weeknight Chicken Curry (Updated)' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Weeknight Chicken Curry (Updated)' }),
    ).toBeVisible();
  });
});
