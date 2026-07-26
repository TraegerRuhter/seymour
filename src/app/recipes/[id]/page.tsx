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
import {
  cookCount,
  describeLastCooked,
  lastCookedAt,
  markVariant,
  wearLevel,
} from '@/lib/cook-log';
import { MEAL_TYPE_LABELS } from '@/lib/plan';
import { isHttpUrl } from '@/lib/link-safety';
import StarRating from '@/components/StarRating';

/**
 * A recipe, as the card it is in the library — pulled out of the box and
 * opened up.
 *
 * The library became a box of index cards in #69 and this page stayed a stack
 * of generic rounded panels, so tapping a card dropped you onto a different
 * material entirely. Same stock now, same ruling, same wear driven by the same
 * cook count and the same per-recipe variant.
 *
 * The controls deliberately do *not* live on the paper. Buttons on a card
 * would be a costume; keeping them above it says plainly which part is the
 * recipe and which part is the app.
 */
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
  const wear = wearLevel(cooks);
  const lastCooked = describeLastCooked(lastCookedAt(recipe));
  const filedAs =
    recipe.category || (recipe.mealTypes?.[0] && MEAL_TYPE_LABELS[recipe.mealTypes[0]]) || 'Recipe';

  return (
    <article className="mx-auto max-w-3xl print-serif">
      <div className="no-print mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/recipes" className="text-sm font-medium text-moss hover:underline">
          ← Back to library
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {recipe.instructions.length > 0 && (
            <Link href={`/recipes/${recipe.id}/cook`} className="btn-primary px-4 py-1.5 text-sm">
              Start cooking
            </Link>
          )}
          {/* Cook mode logs the cook itself when you reach the end, so this
              stays for the ordinary case: you cooked it from memory, or off a
              printout, and are recording it after the fact. */}
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
            <span role="status" className="inline-flex items-center gap-2 text-sm text-charcoal/60">
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
              Source ↗
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

      <div className="recipe-sheet" data-wear={wear} data-variant={markVariant(recipe.id)}>
        {wear !== 'pristine' && <span aria-hidden className="ic-mark ic-mark--ring" />}
        {(wear === 'worn' || wear === 'loved') && (
          <span aria-hidden className="ic-mark ic-mark--blot" />
        )}
        {wear === 'loved' && <span aria-hidden className="ic-corner" />}

        {recipe.imageUrl && (
          <span className="rs-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={recipe.imageUrl} alt="" loading="lazy" />
          </span>
        )}

        <header className={`rs-head ${recipe.imageUrl ? '' : 'no-photo'}`}>
          <span className="rs-cat">{filedAs}</span>
          <h1 className="mt-1 text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-tight">
            {recipe.title}
          </h1>
          <div className="no-print mt-2">
            <StarRating
              value={recipe.rating}
              onChange={(rating) => setRecipeRating(recipe.id, rating)}
              label={`Your rating for ${recipe.title}`}
            />
          </div>
          <p className="rs-meta mt-2">
            {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? '' : 's'}
            {recipe.instructions.length > 0 &&
              ` · ${recipe.instructions.length} step${recipe.instructions.length === 1 ? '' : 's'}`}
            {recipe.cookTimeMinutes != null && ` · ${recipe.cookTimeMinutes} min`}
            {' · filed '}
            {new Date(recipe.dateAdded).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          {cooks > 0 && (
            <p className="rs-tally mt-0.5">
              {/* No "last" prefix: describeLastCooked already returns whole
                  phrases, so prefixing produced "last 3 days ago" and, worst
                  of all, "last last week". */}
              Made {cooks === 1 ? 'once' : `${cooks} times`} · {lastCooked}
            </p>
          )}
        </header>

        <div className="rs-body">
          <section aria-label="Ingredients" className="rs-section">
            <h2 className="text-xl font-semibold">Ingredients</h2>
            {/* The line exactly as it was written, in one column. A parsed
                quantity gutter beside it renders "1 lb | 1 lb chicken thighs",
                and dropping to the normalised name instead would lose the part
                that matters most on a detail page — "sliced thin". */}
            <ul className="rs-ing mt-3">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>{ing.originalString}</li>
              ))}
            </ul>
          </section>

          {recipe.instructions.length > 0 && (
            <section aria-label="Instructions" className="rs-section">
              <h2 className="text-xl font-semibold">Instructions</h2>
              <ol className="mt-3 space-y-3">
                {recipe.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden className="rs-step-n w-6 shrink-0 pt-1 text-right">
                      {i + 1}.
                    </span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-label="Notes" className="rs-section">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Notes</h2>
              <span className="rs-meta no-print">
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
              rows={3}
              placeholder="Tweaks, verdicts, substitutions — anything worth remembering next time…"
              className="rs-notes mt-2 text-sm"
            />
          </section>
        </div>
      </div>
    </article>
  );
}
