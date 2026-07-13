'use client';

import { useState } from 'react';
import { usePlanStore, useRecipeStore } from '@/lib/stores';
import { generatePlan } from '@/lib/actions';
import { MEAL_TYPE_LABELS } from '@/lib/plan';
import { MEAL_TYPES, type MealType } from '@/lib/types';

const DAY_CHOICES = [1, 2, 3, 5, 7, 10, 14];

/**
 * The meal-plan configuration + generate controls, split out from the plan
 * viewer so it can be shown on its own or collapsed away.
 */
export default function PlanGenerator({
  onGenerated,
  hasExistingPlan,
}: {
  onGenerated?: () => void;
  hasExistingPlan?: boolean;
}) {
  const recipeCount = useRecipeStore((s) => Object.keys(s.recipes).length);
  const config = usePlanStore((s) => s.config);

  const [days, setDays] = useState(config?.days ?? 7);
  const [mealTypes, setMealTypes] = useState<MealType[]>(
    config?.mealTypes ?? ['breakfast', 'lunch', 'dinner'],
  );

  const canGenerate = recipeCount > 0 && mealTypes.length > 0;

  function toggleMealType(t: MealType) {
    setMealTypes((current) =>
      current.includes(t)
        ? current.filter((x) => x !== t)
        : [...MEAL_TYPES.filter((m) => current.includes(m) || m === t)],
    );
  }

  function handleGenerate() {
    generatePlan(days, mealTypes);
    onGenerated?.();
  }

  return (
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

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="btn-primary"
      >
        {hasExistingPlan ? 'Generate & replace plan' : 'Generate plan'}
      </button>
    </section>
  );
}
