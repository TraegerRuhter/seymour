'use client';

import { useState } from 'react';
import { useRecipeStore, useShoppingStore, usePlanStore } from '@/lib/stores';
import {
  clearArchivedPlans,
  deleteAllRecipes,
  resetEverything,
  resetShoppingList,
} from '@/lib/actions';

/** A destructive action that requires a second click to confirm. */
function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <span className="text-charcoal/70">{confirmLabel}</span>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            setArmed(false);
          }}
          className="rounded-full bg-terracotta px-3 py-1.5 text-sm font-semibold text-white hover:bg-terracotta-dark"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="text-charcoal/60 hover:underline"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      disabled={disabled}
      className="rounded-full border border-terracotta/30 px-4 py-2 text-sm font-medium text-terracotta-dark transition-colors hover:bg-terracotta/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

/** Bulk data-management actions (reset / delete all), each behind a confirm. */
export default function DangerZone() {
  const recipeCount = useRecipeStore((s) => Object.keys(s.recipes).length);
  const archivedCount = usePlanStore((s) => s.archivedPlans.length);
  const hasPlan = usePlanStore((s) => s.plan !== null);
  const itemCount = useShoppingStore((s) => s.items.length);
  const everythingEmpty = recipeCount === 0 && archivedCount === 0 && !hasPlan && itemCount === 0;

  return (
    <section aria-label="Manage data" className="glass-card space-y-4 border-terracotta/20 p-5">
      <div>
        <h2 className="text-xl font-semibold">Manage data</h2>
        <p className="mt-1 text-sm text-charcoal/60">
          Clear things out. These can&apos;t be undone — export a backup first if you might want it
          back.
        </p>
      </div>

      <ul className="space-y-3">
        <li className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Reset shopping list</p>
            <p className="text-xs text-charcoal/50">Uncheck everything and drop manual edits.</p>
          </div>
          <ConfirmButton
            label="Reset list"
            confirmLabel="Reset the shopping list?"
            onConfirm={resetShoppingList}
            disabled={itemCount === 0}
          />
        </li>

        <li className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Delete archived plans</p>
            <p className="text-xs text-charcoal/50">
              {archivedCount} archived plan{archivedCount === 1 ? '' : 's'}.
            </p>
          </div>
          <ConfirmButton
            label="Delete all"
            confirmLabel="Delete every archived plan?"
            onConfirm={clearArchivedPlans}
            disabled={archivedCount === 0}
          />
        </li>

        <li className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Delete all recipes</p>
            <p className="text-xs text-charcoal/50">
              Removes {recipeCount} recipe{recipeCount === 1 ? '' : 's'} and clears the current
              plan.
            </p>
          </div>
          <ConfirmButton
            label="Delete all"
            confirmLabel="Delete every recipe?"
            onConfirm={deleteAllRecipes}
            disabled={recipeCount === 0}
          />
        </li>

        <li className="flex flex-wrap items-center justify-between gap-3 border-t border-charcoal/10 pt-3">
          <div>
            <p className="text-sm font-semibold text-terracotta-dark">Reset everything</p>
            <p className="text-xs text-charcoal/50">
              Wipe all recipes, plans (including archive), the shopping list, and pantry staples.
            </p>
          </div>
          <ConfirmButton
            label="Reset all"
            confirmLabel="Erase everything?"
            onConfirm={resetEverything}
            disabled={everythingEmpty}
          />
        </li>
      </ul>
    </section>
  );
}
