'use client';

import Link from 'next/link';
import { usePlanStore, useShoppingStore } from '@/lib/stores';
import ShoppingList from '@/components/ShoppingList';
import { SparkleIcon } from '@/components/icons';

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
          <p className="mt-1 flex items-center gap-1.5 text-charcoal/60" aria-live="polite">
            {items.length === 0
              ? 'Nothing here yet.'
              : remaining === 0
                ? 'All done — happy cooking!'
                : `${remaining} of ${items.length} item${items.length === 1 ? '' : 's'} left`}
            {items.length > 0 && remaining === 0 && <SparkleIcon className="h-4 w-4" />}
          </p>
        </div>
        {checkedCount > 0 && (
          <button type="button" onClick={clearChecked} className="btn-secondary px-4 py-1.5 text-sm">
            Uncheck all
          </button>
        )}
      </header>

      {items.length === 0 && !plan && (
        <p className="text-sm text-charcoal/60">
          The list fills itself from your meal plan —{' '}
          <Link href="/plan" className="font-medium text-terracotta hover:underline">
            generate one
          </Link>{' '}
          to get started.
        </p>
      )}

      <ShoppingList />
    </div>
  );
}
