'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRecipeStore } from '@/lib/stores';
import { logCook } from '@/lib/actions';
import { cookCount } from '@/lib/cook-log';
import { cookModeSignOff } from '@/lib/seymour-says';
import { useGrowthStage } from '@/lib/use-growth';
import { useWakeLock } from '@/lib/use-wake-lock';
import Logo from '@/components/Logo';

/**
 * Cooking, as opposed to reading about cooking.
 *
 * One step at a time at a size you can read from across a worktop, the screen
 * held awake, and the ingredients one tap away because step four always says
 * "add the rest of the flour" and never says how much.
 *
 * This is the only surface in the app that covers the chrome. Everywhere else
 * you're browsing and the nav is useful; here you have wet hands and there is
 * exactly one thing to do next.
 */
export default function CookModePage() {
  const { id } = useParams<{ id: string }>();
  const recipe = useRecipeStore((s) => s.recipes[id]);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);

  const steps = recipe?.instructions ?? [];
  const lastStep = steps.length - 1;

  const stage = useGrowthStage();

  useWakeLock(!finished);

  const next = useCallback(() => setStep((s) => Math.min(s + 1, lastStep)), [lastStep]);
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  // Cooking is a two-hands-busy activity, so a keyboard (or a bluetooth page
  // turner, or a nudged spacebar with a knuckle) should move you through it.
  useEffect(() => {
    if (finished) return;
    function onKey(e: KeyboardEvent) {
      // Space is also how a keyboard user presses whatever they've tabbed to,
      // and claiming it globally means tabbing to "Back" and hitting space
      // sends you forwards. Arrows are safe to take unconditionally — no
      // control here does anything with them.
      const target = e.target as HTMLElement | null;
      const onAControl = !!target?.closest('button, a, input, textarea, select, [tabindex]');
      if (e.key === 'ArrowRight' || (e.key === ' ' && !onAControl)) {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Escape') {
        setShowIngredients(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, next, finished]);

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

  if (steps.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="mx-auto max-w-sm text-charcoal/60">
          There are no steps written down for this one, so there&apos;s nothing for me to walk you
          through.
        </p>
        <Link href={`/recipes/${recipe.id}/edit`} className="btn-primary mt-4">
          Add the steps
        </Link>
      </div>
    );
  }

  function finish() {
    logCook(recipe.id);
    setFinished(true);
  }

  // Counted after logging, so "that's the third time" includes this one.
  const madeCount = cookCount(recipe);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bone">
      <header className="flex items-center justify-between gap-3 border-b border-charcoal/10 px-4 pb-3 pt-[calc(1rem_+_var(--safe-top))]">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{recipe.title}</p>
          <p className="text-xs text-charcoal/50" aria-live="polite">
            {finished ? 'Done' : `Step ${step + 1} of ${steps.length}`}
          </p>
        </div>
        <Link
          href={`/recipes/${recipe.id}`}
          className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-charcoal/60 transition-colors hover:bg-charcoal/5"
        >
          Close
        </Link>
      </header>

      <div className="h-1 w-full bg-charcoal/10">
        <div
          className="h-full bg-zest transition-[width] duration-300"
          style={{ width: `${finished ? 100 : ((step + 1) / steps.length) * 100}%` }}
        />
      </div>

      {finished ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <Logo stage={stage} className="animate-float h-24 w-24" />
          <p className="max-w-md text-2xl">{cookModeSignOff(madeCount)}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link href={`/recipes/${recipe.id}`} className="btn-primary">
              Back to the recipe
            </Link>
            <Link href="/" className="btn-secondary">
              Home
            </Link>
          </div>
        </main>
      ) : (
        <>
          <main
            className="flex flex-1 items-center overflow-y-auto px-6 py-8 sm:px-10"
            aria-live="polite"
          >
            <div className="mx-auto w-full max-w-3xl">
              <p aria-hidden className="font-typewriter text-sm tracking-widest text-charcoal/40">
                STEP {step + 1}
              </p>
              {/* Large enough to read at arm's length, and capped so a long
                  step doesn't need scrolling on a phone propped against a jar. */}
              <p className="mt-3 text-[clamp(1.5rem,4.5vw,2.5rem)] font-medium leading-snug">
                {steps[step]}
              </p>
            </div>
          </main>

          <footer className="border-t border-charcoal/10 px-4 pb-[calc(1rem_+_var(--safe-bottom))] pt-3">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <button
                type="button"
                onClick={() => setShowIngredients((v) => !v)}
                aria-expanded={showIngredients}
                className="btn-secondary px-4 py-2.5 text-sm"
              >
                Ingredients
              </button>
              <div className="ml-auto flex items-center gap-3">
                <button
                  type="button"
                  onClick={back}
                  disabled={step === 0}
                  className="btn-secondary px-5 py-2.5"
                >
                  Back
                </button>
                {step === lastStep ? (
                  <button type="button" onClick={finish} className="btn-primary px-6 py-2.5">
                    Done
                  </button>
                ) : (
                  <button type="button" onClick={next} className="btn-primary px-6 py-2.5">
                    Next
                  </button>
                )}
              </div>
            </div>
          </footer>
        </>
      )}

      {showIngredients && !finished && (
        <section
          aria-label="Ingredients"
          className="absolute inset-x-0 bottom-0 max-h-[70svh] overflow-y-auto rounded-t-2xl border-t border-charcoal/10 bg-surface px-5 pb-[calc(1.25rem_+_var(--safe-bottom))] pt-4 shadow-card-hover"
        >
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Ingredients</h2>
              <button
                type="button"
                onClick={() => setShowIngredients(false)}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-charcoal/60 transition-colors hover:bg-charcoal/5"
              >
                Close
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2 text-lg">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />
                  {/* Just the line as written. The detail page also shows a
                      parsed-amount chip, which here would render "1 lb chicken
                      thighs · 1 lb" — noise on the one screen you're reading
                      at a glance with a pan going. */}
                  <span>{ing.originalString}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
