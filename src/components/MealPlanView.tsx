'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePlanStore, useRecipeStore } from '@/lib/stores';
import {
  addMealToDay,
  ensureMealIds,
  moveMealSlot,
  pickSlotRecipe,
  removeMealFromDay,
  setSlotScale,
  shuffleSlot,
  togglePinSlot,
} from '@/lib/actions';
import { MEAL_TYPE_LABELS, fromLocalDateString, toLocalDateString } from '@/lib/plan';
import { MEAL_TYPES, type MealPlanDay, type MealType } from '@/lib/types';
import { enter, fadeRise } from '@/lib/motion';
import ActionMenu from './ActionMenu';
import RecipePicker from './RecipePicker';
import { GripIcon, MEAL_TYPE_ICON, PencilIcon, PinIcon, ShuffleIcon, TrashIcon } from './icons';

/**
 * A day, split into the two things a timetable row needs: what to call it, and
 * when it actually is. "Today" is the useful name for one row a week; the date
 * underneath keeps it checkable.
 */
function dayHeading(dateStr: string): { name: string; date: string } {
  const date = fromLocalDateString(dateStr);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const isToday = dateStr === toLocalDateString(new Date());
  return {
    name: isToday ? 'Today' : weekday,
    date: isToday ? `${weekday.slice(0, 3)} ${monthDay}` : monthDay,
  };
}

/**
 * A single meal tile. Empty slots offer a manual picker; filled slots offer a
 * shuffle (random swap) plus a menu with pin, manual change, and remove.
 */
function MealTile({ dayIndex, mealIndex }: { dayIndex: number; mealIndex: number }) {
  const slot = usePlanStore((s) => s.plan?.[dayIndex]?.meals[mealIndex]);
  const recipes = useRecipeStore((s) => s.recipes);
  const [picking, setPicking] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);

  // Falls back to a placeholder id for the rare frame where a slot hasn't
  // been backfilled yet (ensureMealIds runs on mount) — useSortable can't be
  // called conditionally, so this keeps the hook order stable either way.
  const sortableId = slot?.id ?? `pending-${dayIndex}-${mealIndex}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition };

  if (!slot) return null;
  const recipe = slot.recipeId ? recipes[slot.recipeId] : undefined;
  const MealIcon = MEAL_TYPE_ICON[slot.type];
  const label = MEAL_TYPE_LABELS[slot.type];

  function pick(recipeId: string) {
    pickSlotRecipe(dayIndex, mealIndex, recipeId);
    setPicking(false);
  }

  const gripHandle = (
    <button
      type="button"
      aria-label={`Drag to move ${label}`}
      {...attributes}
      {...listeners}
      className="touch-none shrink-0 cursor-grab self-stretch rounded-lg text-charcoal/25 transition-colors hover:bg-charcoal/5 hover:text-charcoal/70 active:cursor-grabbing"
    >
      <GripIcon className="h-4 w-4" />
    </button>
  );

  if (!recipe || picking) {
    return (
      <div
        ref={(node) => {
          tileRef.current = node;
          setNodeRef(node);
        }}
        style={dragStyle}
        className={`rounded-xl border border-dashed border-charcoal/20 p-3 ${isDragging ? 'opacity-30' : ''}`}
      >
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-charcoal/70">
          {gripHandle}
          <MealIcon className="h-4 w-4" />
          {label}
        </p>
        {!picking && (
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="text-sm font-medium text-moss-strong hover:underline"
            >
              Pick manually
            </button>
            <button
              type="button"
              onClick={() => removeMealFromDay(dayIndex, mealIndex)}
              className="text-sm font-medium text-charcoal/70 hover:text-charcoal hover:underline"
            >
              Remove
            </button>
          </div>
        )}
        {picking && (
          <RecipePicker
            anchorRef={tileRef}
            mealType={slot.type}
            recipes={Object.values(recipes)}
            onPick={pick}
            onClose={() => setPicking(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={(node) => {
        tileRef.current = node;
        setNodeRef(node);
      }}
      style={dragStyle}
      className={`wk-meal group relative p-2.5 ${isDragging ? 'opacity-30' : ''}`}
    >
      {/* One line per meal on anything but a phone. At 400px the title, the
          servings stepper, shuffle and the menu were all fighting for the same
          row and the titles truncated, so below `sm` the controls wrap under
          the title — vertical space is the cheaper of the two there. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {gripHandle}
        <Link
          href={`/recipes/${recipe.id}`}
          className="flex min-w-0 flex-1 basis-[calc(100%-2.5rem)] items-center gap-3 sm:basis-0"
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
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-moss/12">
              <MealIcon className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-charcoal/70">
              {label}
              {slot.pinned && (
                <PinIcon filled className="h-3.5 w-3.5" aria-label="Pinned — kept when shuffling" />
              )}
            </p>
            <p className="truncate text-sm font-semibold">{recipe.title}</p>
          </div>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ServingsStepper
            dayIndex={dayIndex}
            mealIndex={mealIndex}
            scale={slot.scale ?? 1}
            baseServings={recipe.servings}
          />
          <button
            type="button"
            aria-label={`Shuffle ${label} to a different recipe`}
            onClick={() => shuffleSlot(dayIndex, mealIndex)}
            className="rounded-lg p-1.5 text-charcoal/70 transition-colors hover:bg-moss/12 hover:text-charcoal"
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
      {picking && (
        <RecipePicker
          anchorRef={tileRef}
          mealType={slot.type}
          recipes={Object.values(recipes)}
          onPick={pick}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/**
 * The per-meal servings control. With a base declared on the recipe it reads
 * "Serves N" and steps a whole serving at a time; without one there's no
 * honest way to show an absolute count, so it reads as a multiplier ("×1½")
 * stepping by half. Either way the shopping list scales this meal by it.
 */
function ServingsStepper({
  dayIndex,
  mealIndex,
  scale,
  baseServings,
}: {
  dayIndex: number;
  mealIndex: number;
  scale: number;
  baseServings?: number;
}) {
  const label = baseServings
    ? `Serves ${formatScaled(baseServings * scale)}`
    : `×${formatScaled(scale)}`;
  const step = baseServings ? 1 / baseServings : 0.5;

  return (
    <div className="mt-2 flex items-center pl-14">
      <span
        role="group"
        aria-label="Servings for this meal"
        className="inline-flex h-6 items-center overflow-hidden rounded-full border border-charcoal/15 bg-surface"
      >
        <button
          type="button"
          aria-label="Fewer servings"
          onClick={() => setSlotScale(dayIndex, mealIndex, scale - step)}
          className="grid h-full w-6 place-items-center text-charcoal/70 transition-colors hover:bg-moss/12 hover:text-charcoal"
        >
          −
        </button>
        <span className="min-w-14 border-x border-charcoal/10 px-1.5 text-center text-xs font-semibold tabular-nums text-charcoal/70">
          {label}
        </span>
        <button
          type="button"
          aria-label="More servings"
          onClick={() => setSlotScale(dayIndex, mealIndex, scale + step)}
          className="grid h-full w-6 place-items-center text-charcoal/70 transition-colors hover:bg-moss/12 hover:text-charcoal"
        >
          +
        </button>
      </span>
      {scale !== 1 && (
        <span className="ml-2 text-[11px] text-charcoal/70">
          {baseServings ? `as written: ${baseServings}` : 'of the written recipe'}
        </span>
      )}
    </div>
  );
}

/** "2", "1.5", "2.25" → trimmed, no trailing zeros; guards float dust. */
function formatScaled(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** The "＋ Add a meal" affordance: tap to reveal a row of meal-type choices. */
function AddMeal({ dayIndex }: { dayIndex: number }) {
  const [choosing, setChoosing] = useState(false);

  if (!choosing) {
    return (
      <button
        type="button"
        onClick={() => setChoosing(true)}
        className="w-full rounded-lg p-2 text-left text-sm font-medium text-charcoal/70 transition-colors hover:bg-charcoal/[0.04] hover:text-charcoal/70"
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
          className="rounded-full border border-charcoal/15 bg-surface/70 px-2.5 py-1 text-xs font-medium text-charcoal/70 transition-colors hover:bg-zest hover:text-zest-ink"
        >
          {MEAL_TYPE_LABELS[t]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setChoosing(false)}
        aria-label="Cancel adding a meal"
        className="ml-auto rounded-full px-2 py-1 text-xs font-medium text-charcoal/70 hover:text-charcoal"
      >
        Cancel
      </button>
    </div>
  );
}

/**
 * One day's meal list, both a sortable list (for reordering within the day)
 * and a droppable container in its own right (so an empty day, or dropping
 * past the last item, still registers as a valid target).
 */
function DayMealList({ dayIndex, day }: { dayIndex: number; day: MealPlanDay }) {
  const { setNodeRef } = useDroppable({ id: `day:${dayIndex}` });
  const itemIds = day.meals.map((m, i) => m.id ?? `pending-${dayIndex}-${i}`);

  return (
    <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className="wk-meals space-y-0.5">
        {day.meals.map((_, mealIndex) => (
          <MealTile key={itemIds[mealIndex]} dayIndex={dayIndex} mealIndex={mealIndex} />
        ))}
        {day.meals.length === 0 && (
          <p className="rounded-xl border border-dashed border-charcoal/20 p-3 text-sm text-charcoal/70">
            Nothing planned — eating out?
          </p>
        )}
        <AddMeal dayIndex={dayIndex} />
      </div>
    </SortableContext>
  );
}

/**
 * Day-by-day plan: horizontally scrollable snap cards on mobile,
 * a wrapping multi-column grid on desktop. Meals can be dragged to reorder
 * within a day or dropped onto another day entirely (grip handle on each
 * tile — the rest of the tile stays click/tap-only so the drag can't
 * accidentally steal a link or button press).
 */
export default function MealPlanView() {
  const plan = usePlanStore((s) => s.plan);
  const config = usePlanStore((s) => s.config);
  const recipes = useRecipeStore((s) => s.recipes);
  const [activeLocation, setActiveLocation] = useState<{
    dayIndex: number;
    mealIndex: number;
  } | null>(null);

  useEffect(() => {
    ensureMealIds();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const locationById = useMemo(() => {
    const map = new Map<string, { dayIndex: number; mealIndex: number }>();
    plan?.forEach((day, dayIndex) => {
      day.meals.forEach((slot, mealIndex) => {
        if (slot.id) map.set(slot.id, { dayIndex, mealIndex });
      });
    });
    return map;
  }, [plan]);

  if (!plan || plan.length === 0) return null;

  const todayStr = toLocalDateString(new Date());
  const shoppingThrough = config?.shoppingThrough;
  const activeSlot = activeLocation
    ? plan[activeLocation.dayIndex]?.meals[activeLocation.mealIndex]
    : undefined;
  const activeRecipe = activeSlot?.recipeId ? recipes[activeSlot.recipeId] : undefined;
  const ActiveMealIcon = activeSlot ? MEAL_TYPE_ICON[activeSlot.type] : undefined;

  function handleDragStart(event: DragStartEvent) {
    setActiveLocation(locationById.get(String(event.active.id)) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLocation(null);
    if (!plan) return;
    const { active, over } = event;
    if (!over) return;
    const from = locationById.get(String(active.id));
    if (!from) return;

    const overId = String(over.id);
    let toDayIndex: number;
    let toMealIndex: number;
    if (overId.startsWith('day:')) {
      toDayIndex = Number(overId.slice(4));
      toMealIndex = plan[toDayIndex]?.meals.length ?? 0;
    } else {
      const to = locationById.get(overId);
      if (!to) return;
      toDayIndex = to.dayIndex;
      toMealIndex = to.mealIndex;
    }

    if (from.dayIndex === toDayIndex && from.mealIndex === toMealIndex) return;
    moveMealSlot(from.dayIndex, from.mealIndex, toDayIndex, toMealIndex);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="week">
        {plan.map((day, dayIndex) => {
          const heading = dayHeading(day.date);
          return (
            <motion.section
              key={day.date}
              aria-label={`${heading.name} · ${heading.date}`}
              data-today={day.date === todayStr}
              // Planned, but deliberately not on the shopping list yet. Marked
              // rather than hidden — it's a real part of the plan, it just
              // isn't something you're buying for today.
              data-unshopped={shoppingThrough ? day.date > shoppingThrough : false}
              variants={fadeRise}
              initial="initial"
              animate="animate"
              transition={{ ...enter, delay: Math.min(dayIndex * 0.03, 0.24) }}
              className="wk-day"
            >
              <div className="wk-when">
                <h3 className="wk-dayname">{heading.name}</h3>
                <span className="wk-date">{heading.date}</span>
              </div>
              <DayMealList dayIndex={dayIndex} day={day} />
            </motion.section>
          );
        })}
      </div>
      <DragOverlay>
        {activeSlot && (
          <div className="flex items-center gap-2 rounded-xl bg-surface p-3 shadow-card-hover">
            {ActiveMealIcon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-moss/12">
                <ActiveMealIcon className="h-5 w-5" />
              </span>
            )}
            <span className="truncate text-sm font-semibold">
              {activeRecipe?.title ?? MEAL_TYPE_LABELS[activeSlot.type]}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
