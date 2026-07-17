'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { usePlanStore, useRecipeStore } from '@/lib/stores';
import {
  addMealToDay,
  pickSlotRecipe,
  removeMealFromDay,
  shuffleSlot,
  togglePinSlot,
} from '@/lib/actions';
import { MEAL_TYPE_LABELS, recipeFitsMealType, toLocalDateString } from '@/lib/plan';
import { MEAL_TYPES, type MealType } from '@/lib/types';
import { enter, fadeRise } from '@/lib/motion';
import ActionMenu from './ActionMenu';
import { MEAL_TYPE_ICON, PencilIcon, PinIcon, ShuffleIcon, TrashIcon } from './icons';

function dayHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return dateStr === toLocalDateString(new Date())
    ? `Today · ${monthDay}`
    : `${weekday} · ${monthDay}`;
}

/**
 * A single meal tile. Empty slots offer a manual picker; filled slots offer a
 * shuffle (random swap) plus a menu with pin, manual change, and remove.
 */
function MealTile({ dayIndex, mealIndex }: { dayIndex: number; mealIndex: number }) {
  const slot = usePlanStore((s) => s.plan?.[dayIndex]?.meals[mealIndex]);
  const recipes = useRecipeStore((s) => s.recipes);
  const [picking, setPicking] = useState(false);

  if (!slot) return null;
  const recipe = slot.recipeId ? recipes[slot.recipeId] : undefined;
  const MealIcon = MEAL_TYPE_ICON[slot.type];
  const label = MEAL_TYPE_LABELS[slot.type];

  if (!recipe || picking) {
    const all = Object.values(recipes);
    // Same fallback as generation: if meal-type tagging would leave nothing
    // to pick, show everything rather than an empty dropdown.
    const fitting = all.filter((r) => recipeFitsMealType(r, slot.type));
    const pickable = fitting.length > 0 ? fitting : all;
    return (
      <div className="rounded-xl border border-dashed border-charcoal/20 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-charcoal/40">
          <MealIcon className="h-4 w-4" />
          {label}
        </p>
        {picking ? (
          <select
            autoFocus
            aria-label={recipe ? `Change the recipe for ${label}` : `Pick a recipe for ${label}`}
            className="input-base mt-2 py-1.5 text-sm"
            defaultValue={recipe?.id ?? ''}
            onChange={(e) => {
              if (e.target.value) pickSlotRecipe(dayIndex, mealIndex, e.target.value);
              setPicking(false);
            }}
            onBlur={() => setPicking(false)}
          >
            {!recipe && (
              <option value="" disabled>
                Choose a recipe…
              </option>
            )}
            {pickable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="text-sm font-medium text-terracotta hover:underline"
            >
              Pick manually
            </button>
            <button
              type="button"
              onClick={() => removeMealFromDay(dayIndex, mealIndex)}
              className="text-sm font-medium text-charcoal/40 hover:text-charcoal hover:underline"
            >
              Remove
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group relative flex items-center gap-3 rounded-xl bg-surface/60 p-3 transition-colors hover:bg-surface">
      <Link href={`/recipes/${recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3">
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
            <MealIcon className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-charcoal/40">
            {label}
            {slot.pinned && (
              <PinIcon filled className="h-3.5 w-3.5" aria-label="Pinned — kept when shuffling" />
            )}
          </p>
          <p className="truncate text-sm font-semibold">{recipe.title}</p>
        </div>
      </Link>
      <div className="flex shrink-0 gap-0.5">
        <button
          type="button"
          aria-label={`Shuffle ${label} to a different recipe`}
          onClick={() => shuffleSlot(dayIndex, mealIndex)}
          className="rounded-lg p-1.5 text-charcoal/40 transition-colors hover:bg-olive/15 hover:text-charcoal"
        >
          <ShuffleIcon className="h-4 w-4" />
        </button>
        <ActionMenu
          ariaLabel={`More actions for ${label}: ${recipe.title}`}
          items={[
            {
              label: slot.pinned ? 'Unpin' : 'Pin (keep when shuffling)',
              icon: PinIcon,
              onSelect: () => togglePinSlot(dayIndex, mealIndex),
            },
            {
              label: 'Change recipe…',
              icon: PencilIcon,
              onSelect: () => setPicking(true),
            },
            {
              label: 'Remove meal',
              icon: TrashIcon,
              tone: 'danger',
              onSelect: () => removeMealFromDay(dayIndex, mealIndex),
            },
          ]}
        />
      </div>
    </div>
  );
}

/** The "＋ Add a meal" affordance: tap to reveal a row of meal-type choices. */
function AddMeal({ dayIndex }: { dayIndex: number }) {
  const [choosing, setChoosing] = useState(false);

  if (!choosing) {
    return (
      <button
        type="button"
        onClick={() => setChoosing(true)}
        className="w-full rounded-xl p-2 text-sm font-medium text-charcoal/40 transition-colors hover:bg-surface/60 hover:text-charcoal/70"
      >
        ＋ Add a meal
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-charcoal/20 p-2">
      {MEAL_TYPES.map((t: MealType) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            addMealToDay(dayIndex, t);
            setChoosing(false);
          }}
          className="rounded-full border border-charcoal/15 bg-surface/70 px-2.5 py-1 text-xs font-medium text-charcoal/70 transition-colors hover:bg-olive hover:text-white"
        >
          {MEAL_TYPE_LABELS[t]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setChoosing(false)}
        aria-label="Cancel adding a meal"
        className="ml-auto rounded-full px-2 py-1 text-xs font-medium text-charcoal/40 hover:text-charcoal"
      >
        Cancel
      </button>
    </div>
  );
}

/**
 * Day-by-day plan: horizontally scrollable snap cards on mobile,
 * a wrapping multi-column grid on desktop.
 */
export default function MealPlanView() {
  const plan = usePlanStore((s) => s.plan);
  if (!plan || plan.length === 0) return null;

  const todayStr = toLocalDateString(new Date());

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
            {day.meals.length === 0 && (
              <p className="rounded-xl border border-dashed border-charcoal/20 p-3 text-sm text-charcoal/50">
                Nothing planned — eating out?
              </p>
            )}
            <AddMeal dayIndex={dayIndex} />
          </div>
        </motion.section>
      ))}
    </div>
  );
}
