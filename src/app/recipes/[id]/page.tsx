'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRecipeStore } from '@/lib/stores';
import {
  deleteRecipe,
  logCook,
  setRecipeNotes,
  setRecipeRating,
  undoLastCook,
} from '@/lib/actions';
import { cookCount, describeLastCooked, lastCookedAt } from '@/lib/cook-log';
import { displayUnit, formatQuantity } from '@/lib/units';
import { MEAL_TYPE_LABELS } from '@/lib/plan';
import { isHttpUrl } from '@/lib/link-safety';
import StarRating from '@/components/StarRating';

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const recipe = useRecipeStore((s) => s.recipes[id]);
  const [confirming, setConfirming] = useState(false);
  const [justCooked, setJustCooked] = useState(false);
  const [notesDraft, setNotesDraft] = useState(recipe?.notes ?? '');
  const [notesSaved, setNotesSaved] = useState(true);

  // Re-sync the draft when navigating between recipes (or when a remote
  // sync pulls in a newer value) without clobbering in-progress typing.
  useEffect(() => {
    setNotesDraft(recipe?.notes ?? '');
    setNotesSaved(true);
  }, [recipe?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function commitNotes() {
    if (!recipe || notesDraft === (recipe.notes ?? '')) return;
    setRecipeNotes(recipe.id, notesDraft);
    setNotesSaved(true);
  }

  if (!recipe) {
    return (
      <div className="py-16 text-center">
        <p className="text-charcoal/60">That recipe isn&apos;t here. Deleted, or possibly eaten.</p>
        <Link href="/recipes" className="btn-secondary mt-4">
          Back to library
        </Link>
      </div>
    );
  }

  function handleDelete() {
    deleteRecipe(recipe.id);
    router.push('/recipes');
  }

  const cooks = cookCount(recipe);
  const lastCooked = describeLastCooked(lastCookedAt(recipe));

  return (
    <article className="mx-auto max-w-3xl print-serif">
      <div className="no-print mb-4">
        <Link href="/recipes" className="text-sm font-medium text-moss hover:underline">
          ← Back to library
        </Link>
      </div>

      <header className="glass-card overflow-hidden">
        {recipe.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.imageUrl} alt="" className="aspect-[2/1] w-full object-cover" />
        )}
        <div className="p-6">
          <h1 className="text-3xl font-bold">{recipe.title}</h1>
          <div className="no-print mt-2">
            <StarRating
              value={recipe.rating}
              onChange={(rating) => setRecipeRating(recipe.id, rating)}
              label={`Your rating for ${recipe.title}`}
            />
          </div>
          {(recipe.category ||
            recipe.mainIngredient ||
            recipe.cookTimeMinutes != null ||
            recipe.mealTypes?.length) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recipe.category && (
                <span className="rounded-full bg-moss/10 px-2.5 py-1 text-xs font-medium text-moss-strong">
                  {recipe.category}
                </span>
              )}
              {recipe.mainIngredient && (
                <span className="rounded-full bg-charcoal/10 px-2.5 py-1 text-xs font-medium text-charcoal/70">
                  {recipe.mainIngredient}
                </span>
              )}
              {recipe.cookTimeMinutes != null && (
                <span className="rounded-full bg-moss/10 px-2.5 py-1 text-xs font-medium text-zest-strong">
                  {recipe.cookTimeMinutes} min
                </span>
              )}
              {recipe.mealTypes?.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-moss/10 px-2.5 py-1 text-xs font-medium text-zest-strong"
                >
                  {MEAL_TYPE_LABELS[t]}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-sm text-charcoal/50">
            {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? '' : 's'}
            {recipe.instructions.length > 0 &&
              ` · ${recipe.instructions.length} step${recipe.instructions.length === 1 ? '' : 's'}`}
            {' · added '}
            {new Date(recipe.dateAdded).toLocaleDateString(undefined, {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          {cooks > 0 && (
            <p className="mt-1 text-sm font-medium text-zest-strong">
              Made {cooks === 1 ? 'once' : `${cooks} times`} · last {lastCooked.toLowerCase()}
            </p>
          )}
          <div className="no-print mt-4 flex flex-wrap items-center gap-3">
            {/* Cook mode logs the cook itself when you reach the end, so this
                stays for the ordinary case: you cooked it from memory, or off
                a printout, and are recording it after the fact. */}
            {recipe.instructions.length > 0 && (
              <Link href={`/recipes/${recipe.id}/cook`} className="btn-primary px-4 py-1.5 text-sm">
                Start cooking
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                logCook(recipe.id);
                setJustCooked(true);
              }}
              className="btn-secondary px-4 py-1.5 text-sm"
            >
              Cooked it
            </button>
            {justCooked && (
              <span
                role="status"
                className="inline-flex items-center gap-2 text-sm text-charcoal/60"
              >
                Logged.
                <button
                  type="button"
                  onClick={() => {
                    undoLastCook(recipe.id);
                    setJustCooked(false);
                  }}
                  className="font-medium text-moss hover:underline"
                >
                  Undo
                </button>
              </span>
            )}
            {recipe.sourceUrl && isHttpUrl(recipe.sourceUrl) && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary px-4 py-1.5 text-sm"
              >
                View source ↗
              </a>
            )}
            <Link href={`/recipes/${recipe.id}/edit`} className="btn-secondary px-4 py-1.5 text-sm">
              Edit
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-secondary px-4 py-1.5 text-sm"
            >
              Print
            </button>
            {confirming ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-clay/10 px-3 py-1.5 text-sm">
                Delete this recipe?
                <button
                  type="button"
                  onClick={handleDelete}
                  className="font-semibold text-clay hover:underline"
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-charcoal/60 hover:underline"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-full px-4 py-1.5 text-sm font-medium text-clay transition-colors hover:bg-clay/10"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </header>

      <section aria-label="Ingredients" className="glass-card mt-6 p-6">
        <h2 className="text-xl font-semibold">Ingredients</h2>
        <ul className="mt-3 space-y-2">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />
              <span>
                {ing.originalString}
                {ing.quantity > 0 && (
                  <span className="ml-2 whitespace-nowrap rounded-full bg-moss/12 px-2 py-0.5 text-xs text-charcoal/70">
                    {formatQuantity(ing.quantity)} {displayUnit(ing.unit, ing.quantity) || '×'}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {recipe.instructions.length > 0 && (
        <section aria-label="Instructions" className="glass-card mt-6 p-6">
          <h2 className="text-xl font-semibold">Instructions</h2>
          <ol className="mt-3 space-y-3">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-moss/10 text-sm font-semibold text-moss-strong"
                >
                  {i + 1}
                </span>
                <p className="pt-0.5">{step}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-label="Notes" className="glass-card mt-6 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Notes</h2>
          <span className="no-print text-xs text-charcoal/40">
            {notesSaved ? '' : 'Unsaved — click away to save'}
          </span>
        </div>
        <label htmlFor="recipe-notes" className="sr-only">
          Notes for {recipe.title}
        </label>
        <textarea
          id="recipe-notes"
          value={notesDraft}
          onChange={(e) => {
            setNotesDraft(e.target.value);
            setNotesSaved(false);
          }}
          onBlur={commitNotes}
          rows={4}
          placeholder="Tweaks, verdicts, substitutions — anything worth remembering next time…"
          className="input-base mt-3 text-sm"
        />
      </section>
    </article>
  );
}
