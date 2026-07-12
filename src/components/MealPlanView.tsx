'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { usePlanStore, useRecipeStore } from '@/lib/stores';
import { pickSlotRecipe } from '@/lib/actions';
import { MEAL_TYPE_LABELS, recipeFitsMealType } from '@/lib/plan';
import { enter, fadeRise } from '@/lib/motion';
import { MEAL_TYPE_ICON } from './icons';

function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return dateStr === localDateString(new Date()) ? `Today · ${monthDay}` : `${weekday} · ${monthDay}`;
}

/** A single meal tile; empty slots offer a manual picker. */
function MealTile({
  dayIndex,
  mealIndex,
}: {
  dayIndex: number;
  mealIndex: number;
}) {
  const slot = usePlanStore((s) => s.plan?.[dayIndex]?.meals[mealIndex]);
  const recipes = useRecipeStore((s) => s.recipes);
  const [picking, setPicking] = useState(false);

  if (!slot) return null;
  const recipe = slot.recipeId ? recipes[slot.recipeId] : undefined;

  if (!recipe) {
    const all = Object.values(recipes);
    // Same fallback as generation: if meal-type tagging would leave nothing
    // to pick, show everything rather than an empty dropdown.
    const fitting = all.filter((r) => recipeFitsMealType(r, slot.type));
    const pickable = fitting.length > 0 ? fitting : all;
    return (
      <div className="rounded-xl border border-dashed border-charcoal/20 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-charcoal/40">
          {(() => {
            const Icon = MEAL_TYPE_ICON[slot.type];
            return <Icon className="h-4 w-4" />;
          })()}
          {MEAL_TYPE_LABELS[slot.type]}
        </p>
        {picking ? (
          <select
            autoFocus
            aria-label={`Pick a recipe for ${MEAL_TYPE_LABELS[slot.type]}`}
            className="input-base mt-2 py-1.5 text-sm"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) pickSlotRecipe(dayIndex, mealIndex, e.target.value);
              setPicking(false);
            }}
            onBlur={() => setPicking(false)}
          >
            <option value="" disabled>
              Choose a recipe…
            </option>
            {pickable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="mt-1 text-sm font-medium text-terracotta hover:underline"
          >
            Pick manually
          </button>
        )}
      </div>
    );
  }

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="flex items-center gap-3 rounded-xl bg-surface/60 p-3 transition-colors hover:bg-surface"
    >
      {recipe.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.imageUrl}
          alt=""
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-olive/15">
          {(() => {
            const Icon = MEAL_TYPE_ICON[slot.type];
            return <Icon className="h-6 w-6" />;
          })()}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-charcoal/40">
          {MEAL_TYPE_LABELS[slot.type]}
        </p>
        <p className="truncate text-sm font-semibold">{recipe.title}</p>
      </div>
    </Link>
  );
}

/**
 * Day-by-day plan: horizontally scrollable snap cards on mobile,
 * a wrapping multi-column grid on desktop.
 */
export default function MealPlanView() {
  const plan = usePlanStore((s) => s.plan);
  if (!plan || plan.length === 0) return null;

  const todayStr = localDateString(new Date());

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-3 lg:overflow-visible lg:px-0 xl:grid-cols-4">
      {plan.map((day, dayIndex) => (
        <motion.section
          key={day.date}
          aria-label={dayHeading(day.date)}
          variants={fadeRise}
          initial="initial"
          animate="animate"
          transition={{ ...enter, delay: Math.min(dayIndex * 0.04, 0.3) }}
          className={`glass-card w-72 shrink-0 snap-start p-4 lg:w-auto ${
            day.date === todayStr ? 'ring-2 ring-terracotta/60' : ''
          }`}
        >
          <h3 className="mb-3 font-semibold">{dayHeading(day.date)}</h3>
          <div className="space-y-2">
            {day.meals.map((_, mealIndex) => (
              <MealTile key={mealIndex} dayIndex={dayIndex} mealIndex={mealIndex} />
            ))}
          </div>
        </motion.section>
      ))}
    </div>
  );
}