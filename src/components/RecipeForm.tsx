'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import type { Recipe } from '@/lib/types';
import { parseIngredientLines } from '@/lib/ingredient-parser';
import { saveRecipe } from '@/lib/actions';

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
    existing?.ingredients.map((i) => i.originalString).join('\n') ?? initialValues?.ingredientsText ?? '',
  );
  const [instructionsText, setInstructionsText] = useState(
    existing?.instructions.join('\n') ?? initialValues?.instructionsText ?? '',
  );
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ingredientLines = ingredientsText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!title.trim()) {
      setError('Give the recipe a title.');
      return;
    }
    if (ingredientLines.length === 0) {
      setError('Add at least one ingredient.');
      return;
    }
    const recipe: Recipe = {
      id: existing?.id ?? nanoid(),
      title: title.trim(),
      sourceUrl: sourceUrl.trim(),
      imageUrl: imageUrl.trim() || undefined,
      ingredients: parseIngredientLines(ingredientLines),
      instructions: instructionsText.split('\n').map((l) => l.trim()).filter(Boolean),
      dateAdded: existing?.dateAdded ?? new Date().toISOString(),
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

      <div className="grid gap-4 sm:grid-cols-2">
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
        <div>
          <label htmlFor="rf-image" className="mb-1 block text-sm font-medium">
            Image URL <span className="font-normal text-charcoal/40">(optional)</span>
          </label>
          <input
            id="rf-image"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="input-base"
            placeholder="https://…"
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
        <p role="alert" className="rounded-xl bg-terracotta/10 px-4 py-2 text-sm text-terracotta-dark">
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
