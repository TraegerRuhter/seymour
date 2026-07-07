'use client';

import { useEffect } from 'react';
import { useAllHydrated, usePlanStore, useRecipeStore } from '@/lib/stores';
import { regenerateShoppingList } from '@/lib/actions';

/**
 * Client-side app chrome: waits for IndexedDB rehydration before showing
 * pages (so persisted state never flashes empty), keeps the shopping list
 * derived from the plan + recipes, and registers the service worker.
 */
export default function AppProviders({ children }: { children: React.ReactNode }) {
  const hydrated = useAllHydrated();
  const plan = usePlanStore((s) => s.plan);
  const recipes = useRecipeStore((s) => s.recipes);

  // Re-derive the shopping list whenever the plan or the recipe collection
  // changes (covers edits made on other pages and imported data).
  useEffect(() => {
    if (hydrated) regenerateShoppingList();
  }, [hydrated, plan, recipes]);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support is progressive enhancement; ignore failures.
      });
    }
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-label="Loading RecipeBoard">
        <div className="text-center">
          <span className="text-4xl" role="img" aria-hidden>
            🍳
          </span>
          <p className="mt-3 text-sm text-charcoal/50">Warming up the kitchen…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
