'use client';

import Link from 'next/link';
import { usePlanStore, useShoppingStore } from '@/lib/stores';
import ShoppingList from '@/components/ShoppingList';
import ChompingSeymour from '@/components/ChompingSeymour';

export default function ShoppingListPage() {
  const items = useShoppingStore((s) => s.items);
  const clearChecked = useShoppingStore((s) => s.clearChecked);
  const plan = usePlanStore((s) => s.plan);

  const remaining = items.filter((i) => !i.checked).length;
  const checkedCount = items.length - remaining;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Shopping list</h1>
          <p className="mt-1 flex items-center gap-1.5 text-charcoal/70" aria-live="polite">
            {items.length === 0
              ? 'Nothing to shop for.'
              : remaining === 0
                ? 'All done. Bring it home.'
                : `${remaining} of ${items.length} item${items.length === 1 ? '' : 's'} left`}
            {/* Mounted for the whole life of a non-empty list, not just when
                it's finished, so it can see the moment you finish it. */}
            {items.length > 0 && (
              <ChompingSeymour done={remaining === 0} className="h-7 w-7 shrink-0" />
            )}
          </p>
        </div>
        {checkedCount > 0 && (
          <button
            type="button"
            onClick={clearChecked}
            className="btn-secondary px-4 py-1.5 text-sm"
          >
            Uncheck all
          </button>
        )}
      </header>

      <p className="text-sm text-charcoal/70">
        Already stocked on something?{' '}
        <Link href="/settings#pantry" className="font-medium text-moss-strong hover:underline">
          Add it to your spice rack
        </Link>{' '}
        to keep it off this list.
      </p>

      {items.length === 0 && !plan && (
        <p className="text-sm text-charcoal/70">
          The list fills itself from your meal plan —{' '}
          <Link href="/plan" className="font-medium text-moss-strong hover:underline">
            generate one
          </Link>{' '}
          to get started.
        </p>
      )}

      <ShoppingList />
    </div>
  );
}
