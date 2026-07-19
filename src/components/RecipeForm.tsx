'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { MEAL_TYPES, type MealType, type Recipe } from '@/lib/types';
import { MEAL_TYPE_LABELS } from '@/lib/plan';
import { parseIngredientLines } from '@/lib/ingredient-parser';
import { saveRecipe } from '@/lib/actions';
import { suggestTags } from '@/lib/auto-tag';
import { useRecipeStore } from '@/lib/stores';
import ImagePicker from './ImagePicker';
import { SparkleIcon } from './icons';

/** Pre-fill values for a fresh (non-edit) form, e.g. from the paste-text importer. */
export interface RecipeFormInitialValues {
  title?: string;
  sourceUrl?: string;
  imageUrl?: string;
  ingredientsText?: string;
  instructionsText?: string;
}

/**
 * Manual add / edit form. Ingredients and instructions are edited as plain
 * multiline text (one entry per line); structured parsing happens on save.
 * Pass `existing` to edit a saved recipe, or `initialValues` to pre-fill a new
 * one (e.g. after extracting from pasted text) — `existing` takes precedence
 * if both are somehow given.
 */
export default function RecipeForm({
  existing,
  initialValues,
}: {
  existing?: Recipe;
  initialValues?: RecipeFormInitialValues;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title ?? initialValues?.title ?? '');
  const [sourceUrl, setSourceUrl] = useState(existing?.sourceUrl ?? initialValues?.sourceUrl ?? '');
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? initialValues?.imageUrl ?? '');
  const [ingredientsText, setIngredientsText] = useState(
    existing?.ingredients.map((i) => i.originalString).join('\n') ??
      initialValues?.ingredientsText ??
      '',
  );
  const [instructionsText, setInstructionsText] = useState(
    existing?.instructions.join('\n') ?? initialValues?.instructionsText ?? '',
  );
  const [mealTypes, setMealTypes] = useState<MealType[]>(existing?.mealTypes ?? []);
  const [category, setCategory] = useState(existing?.category ?? '');
  const [mainIngredient, setMainIngredient] = useState(existing?.mainIngredient ?? '');
  const [cookTime, setCookTime] = useState(
    existing?.cookTimeMinutes != null ? String(existing.cookTimeMinutes) : '',
  );
  const [servings, setServings] = useState(
    existing?.servings != null ? String(existing.servings) : '',
  );
  const [error, setError] = useState('');
  const [autoTagNote, setAutoTagNote] = useState('');
  const recipes = useRecipeStore((s) => s.recipes);

  function toggleMealType(t: MealType) {
    setMealTypes((current) =>
      current.includes(t) ? current.filter((x) => x !== t) : [...current, t],
    );
  }

  /**
   * Fills in only the meal-type/category/main-ingredient fields still blank
   * — never overwrites something the user (or a previous auto-tag) already
   * set, so running it again after editing the title is always safe.
   */
  function applyAutoTag() {
    const ingredientLines = ingredientsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const existingCategories = Object.values(recipes)
      .map((r) => r.category)
      .filter((c): c is string => !!c);
    const suggested = suggestTags(
      title,
      parseIngredientLines(ingredientLines).map((i) => i.name),
      existingCategories,
    );

    let applied = 0;
    if (mealTypes.length === 0 && suggested.mealTypes.length > 0) {
      setMealTypes(suggested.mealTypes);
      applied++;
    }
    if (!category.trim() && suggested.category) {
      setCategory(suggested.category);
      applied++;
    }
    if (!mainIngredient.trim() && suggested.mainIngredient) {
      setMainIngredient(suggested.mainIngredient);
      applied++;
    }
    setAutoTagNote(
      applied > 0
        ? `Applied ${applied} suggestion${applied === 1 ? '' : 's'} — adjust anything below.`
        : 'Nothing confident to suggest yet — add a title and ingredients, or tag it yourself below.',
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ingredientLines = ingredientsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!title.trim()) {
      setError('Give the recipe a title.');
      return;
    }
    if (ingredientLines.length === 0) {
      setError('Add at least one ingredient.');
      return;
    }
    const cookTimeMinutes = cookTime.trim() ? Number(cookTime) : undefined;
    const servingCount = servings.trim() ? Number(servings) : undefined;
    const recipe: Recipe = {
      id: existing?.id ?? nanoid(),
      title: title.trim(),
      sourceUrl: sourceUrl.trim(),
      imageUrl: imageUrl.trim() || undefined,
      ingredients: parseIngredientLines(ingredientLines),
      instructions: instructionsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      dateAdded: existing?.dateAdded ?? new Date().toISOString(),
      mealTypes: mealTypes.length ? mealTypes : undefined,
      category: category.trim() || undefined,
      mainIngredient: mainIngredient.trim() || undefined,
      cookTimeMinutes:
        cookTimeMinutes != null && !Number.isNaN(cookTimeMinutes) ? cookTimeMinutes : undefined,
      servings:
        servingCount != null && !Number.isNaN(servingCount) && servingCount > 0
          ? servingCount
          : undefined,
    };
    saveRecipe(recipe);
    router.push(`/recipes/${recipe.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="rf-title" className="mb-1 block text-sm font-medium">
          Title
        </label>
        <input
          id="rf-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-base"
          placeholder="Weeknight chicken curry"
        />
      </div>

      <div>
        <label htmlFor="rf-source" className="mb-1 block text-sm font-medium">
          Source URL <span className="font-normal text-charcoal/40">(optional)</span>
        </label>
        <input
          id="rf-source"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="input-base"
          placeholder="https://…"
        />
      </div>

      <ImagePicker value={imageUrl} onChange={setImageUrl} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Tags</h2>
        <button
          type="button"
          onClick={applyAutoTag}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-terracotta hover:underline"
        >
          <SparkleIcon className="h-4 w-4" />
          Auto-tag from title &amp; ingredients
        </button>
      </div>
      {autoTagNote && <p className="-mt-2 text-xs text-charcoal/50">{autoTagNote}</p>}

      <div>
        <h3 className="mb-2 text-sm font-medium">
          Meals{' '}
          <span className="font-normal text-charcoal/40">
            (optional — leave blank to fit any meal)
          </span>
        </h3>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Meal types">
          {MEAL_TYPES.map((t) => {
            const on = mealTypes.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMealType(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  on
                    ? 'bg-olive text-white'
                    : 'border border-charcoal/15 bg-surface/70 text-charcoal/70 hover:bg-surface'
                }`}
              >
                {MEAL_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="rf-category" className="mb-1 block text-sm font-medium">
            Category <span className="font-normal text-charcoal/40">(optional)</span>
          </label>
          <input
            id="rf-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-base"
            placeholder="Soup, Salad, Dessert…"
          />
        </div>
        <div>
          <label htmlFor="rf-main-ingredient" className="mb-1 block text-sm font-medium">
            Main ingredient <span className="font-normal text-charcoal/40">(optional)</span>
          </label>
          <input
            id="rf-main-ingredient"
            value={mainIngredient}
            onChange={(e) => setMainIngredient(e.target.value)}
            className="input-base"
            placeholder="Chicken, ground beef…"
          />
        </div>
        <div>
          <label htmlFor="rf-cook-time" className="mb-1 block text-sm font-medium">
            Cook time <span className="font-normal text-charcoal/40">(minutes)</span>
          </label>
          <input
            id="rf-cook-time"
            type="number"
            inputMode="numeric"
            min={0}
            value={cookTime}
            onChange={(e) => setCookTime(e.target.value)}
            className="input-base"
            placeholder="30"
          />
        </div>
        <div>
          <label htmlFor="rf-servings" className="mb-1 block text-sm font-medium">
            Serves <span className="font-normal text-charcoal/40">(optional)</span>
          </label>
          <input
            id="rf-servings"
            type="number"
            inputMode="numeric"
            min={1}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            className="input-base"
            placeholder="4"
          />
        </div>
      </div>

      <div>
        <label htmlFor="rf-ingredients" className="mb-1 block text-sm font-medium">
          Ingredients <span className="font-normal text-charcoal/40">(one per line)</span>
        </label>
        <textarea
          id="rf-ingredients"
          value={ingredientsText}
          onChange={(e) => setIngredientsText(e.target.value)}
          rows={8}
          className="input-base font-mono text-sm"
          placeholder={'2 cups all-purpose flour\n1½ tsp baking powder\n½ cup milk'}
        />
      </div>

      <div>
        <label htmlFor="rf-instructions" className="mb-1 block text-sm font-medium">
          Instructions <span className="font-normal text-charcoal/40">(one step per line)</span>
        </label>
        <textarea
          id="rf-instructions"
          value={instructionsText}
          onChange={(e) => setInstructionsText(e.target.value)}
          rows={8}
          className="input-base text-sm"
          placeholder={'Preheat the oven to 400°F.\nWhisk the dry ingredients.'}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-terracotta/10 px-4 py-2 text-sm text-terracotta-dark"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" className="btn-primary">
          {existing ? 'Save changes' : 'Save recipe'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
