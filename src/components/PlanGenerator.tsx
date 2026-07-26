'use client';

import { useState } from 'react';
import { usePlanStore, useRecipeStore } from '@/lib/stores';
import { generatePlan } from '@/lib/actions';
import {
  MEAL_TYPE_LABELS,
  addDays,
  fromLocalDateString,
  nextMonday,
  toLocalDateString,
} from '@/lib/plan';
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
  // Today, not the current plan's start date. Replacing this week's plan is
  // the common case and wants today; planning next week is one tap away.
  const [startDate, setStartDate] = useState(() => toLocalDateString(new Date()));

  const canGenerate = recipeCount > 0 && mealTypes.length > 0;

  const today = toLocalDateString(new Date());
  const shortcuts: Array<{ label: string; date: string }> = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: toLocalDateString(addDays(new Date(), 1)) },
    { label: 'Next Monday', date: toLocalDateString(nextMonday(new Date())) },
  ];

  /** "Mon 4 Aug – Sun 10 Aug", so you can check the week before committing to it. */
  const span = (() => {
    const first = fromLocalDateString(startDate);
    const last = addDays(first, days - 1);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return days === 1 ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
  })();

  function toggleMealType(t: MealType) {
    setMealTypes((current) =>
      current.includes(t)
        ? current.filter((x) => x !== t)
        : [...MEAL_TYPES.filter((m) => current.includes(m) || m === t)],
    );
  }

  function handleGenerate() {
    // Today is passed as undefined rather than as a date, so a plan for today
    // stores nothing and stays identical to every plan made before start dates
    // existed.
    generatePlan(days, mealTypes, {
      startDate: startDate === today ? undefined : startDate,
    });
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
                  ? 'bg-moss text-white'
                  : 'border border-charcoal/15 bg-surface/70 text-charcoal/70 hover:bg-surface'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">Starting when?</h2>
        <div className="flex flex-wrap items-center gap-2">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={startDate === s.date}
              onClick={() => setStartDate(s.date)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                startDate === s.date
                  ? 'bg-moss text-white'
                  : 'border border-charcoal/15 bg-surface/70 text-charcoal/70 hover:bg-surface'
              }`}
            >
              {s.label}
            </button>
          ))}
          {/* The shortcuts write into this rather than sitting alongside it as
              a fourth mode: one piece of state, and any date the shortcuts
              don't cover is still reachable. */}
          <input
            type="date"
            value={startDate}
            min={today}
            onChange={(e) => e.target.value && setStartDate(e.target.value)}
            aria-label="Start date"
            className="input-base w-auto py-1.5 text-sm"
          />
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
                    ? 'bg-zest text-zest-ink'
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
          <p className="mt-2 text-sm text-moss-strong" role="alert">
            Pick at least one meal type.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="btn-primary"
        >
          {hasExistingPlan ? 'Generate & replace plan' : 'Generate plan'}
        </button>
        {/* The dates the button is about to produce. Days and a start date are
            two numbers that only mean something together, and "replace" is not
            an outcome to leave someone guessing at. */}
        <p className="text-sm text-charcoal/70">{span}</p>
      </div>
    </section>
  );
}
