'use client';

import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { useAllHydrated, usePlanStore, useRecipeStore, useSettingsStore } from '@/lib/stores';
import { regenerateShoppingList } from '@/lib/actions';
import { applyTheme, getStoredTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { pullAll, subscribeRealtime } from '@/lib/sync';
import Logo from './Logo';

/**
 * Client-side app chrome: waits for IndexedDB rehydration before showing
 * pages (so persisted state never flashes empty), keeps the shopping list
 * derived from the plan + recipes, and registers the service worker.
 */
export default function AppProviders({ children }: { children: React.ReactNode }) {
  const hydrated = useAllHydrated();
  const plan = usePlanStore((s) => s.plan);
  const recipes = useRecipeStore((s) => s.recipes);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { user } = useAuth();

  // Re-derive the shopping list whenever the plan, the recipe collection, or
  // the unit system changes (covers edits on other pages and imported data).
  useEffect(() => {
    if (hydrated) regenerateShoppingList();
  }, [hydrated, plan, recipes, unitSystem]);

  // Reconcile with the server once local data has hydrated and a user is
  // signed in, then keep listening for live changes from other devices
  // until they sign out (or this effect re-runs for a different user).
  useEffect(() => {
    if (!hydrated || !user) return;
    void pullAll();
    return subscribeRealtime();
  }, [hydrated, user]);

  // Follow OS theme changes live while in "system" mode.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (getStoredTheme() === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support is progressive enhancement; ignore failures.
      });
    }
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-label="Loading Seymour">
        <div className="text-center">
          <Logo className="mx-auto h-16 w-16 animate-float" />
          <p className="mt-3 text-sm text-charcoal/50">Waking Seymour up…</p>
        </div>
      </div>
    );
  }

  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
