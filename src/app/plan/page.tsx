'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePlanStore, useRecipeStore } from '@/lib/stores';
import { generatePlan, regeneratePlan } from '@/lib/actions';
import { MEAL_TYPE_LABELS } from '@/lib/plan';
import { MEAL_TYPES, type MealType } from '@/lib/types';
import MealPlanView from '@/components/MealPlanView';

const DAY_CHOICES = [1, 2, 3, 5, 7, 10, 14];

export default function PlanPage() {
  const recipeCount = useRecipeStore((s) => Object.keys(s.recipes).length);
  const plan = usePlanStore((s) => s.plan);
  const config = usePlanStore((s) => s.config);

  const [days, setDays] = useState(config?.days ?? 7);
  const [mealTypes, setMealTypes] = useState<MealType[]>(
    config?.mealTypes ?? ['breakfast', 'lunch', 'dinner'],
  );

  const canGenerate = recipeCount > 0 && mealTypes.length > 0;

  function toggleMealType(t: MealType) {
    setMealTypes((current) =>
      current.includes(t) ? current.filter((x) => x !== t) : [...MEAL_TYPES.filter((m) => current.includes(m) || m === t)],
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Meal plan</h1>
        <p className="mt-1 text-charcoal/60">
          Random picks from your {recipeCount} recipe{recipeCount === 1 ? '' : 's'} — no repeats within a day.
        </p>
      </header>

      <section aria-label="Plan configuration" className="glass-card space-y-4 p-5">
        <div>
          <h2 className="mb-2 text-sm font-medium">How many days?</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Number of days">
            {DAY_CHOICES.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={`min-w-11 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  days === d
                    ? 'bg-terracotta text-white'
                    : 'border border-charcoal/15 bg-surface/70 text-charcoal/70 hover:bg-surface'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium">Which meals?</h2>
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPES.map((t) => {
              const on = mealTypes.includes(t);
              return (
                <label
                  key={t}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    on
                      ? 'bg-olive text-white'
                      : 'border border-charcoal/15 bg-surface/70 text-charcoal/70 hover:bg-surface'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleMealType(t)}
                    className="sr-only"
                  />
                  {MEAL_TYPE_LABELS[t]}
                </label>
              );
            })}
          </div>
          {mealTypes.length === 0 && (
            <p className="mt-2 text-sm text-terracotta-dark" role="alert">
              Pick at least one meal type.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={() => generatePlan(days, mealTypes)}
            disabled={!canGenerate}
            className="btn-primary"
          >
            {plan ? 'Generate new plan' : 'Generate plan'}
          </button>
          {plan && (
            <button type="button" onClick={regeneratePlan} className="btn-secondary">
              🔀 Shuffle
            </button>
          )}
        </div>

        {recipeCount === 0 && (
          <p className="text-sm text-charcoal/60">
            You need some recipes first —{' '}
            <Link href="/add" className="font-medium text-terracotta hover:underline">
              add a few
            </Link>{' '}
            and come back.
          </p>
        )}
      </section>

      {plan ? (
        <MealPlanView />
      ) : (
        recipeCount > 0 && (
          <div className="rounded-2xl border border-dashed border-charcoal/20 p-10 text-center">
            <span aria-hidden className="animate-float text-5xl">🗓️</span>
            <p className="mt-3 text-charcoal/60">
              No plan yet. Pick your days and meals above, then hit Generate.
            </p>
          </div>
        )
      )}
    </div>
  );
}
