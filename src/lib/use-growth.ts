'use client';

import { useMemo } from 'react';
import { useRecipeStore } from './stores';
import { cookCount } from './cook-log';
import { growthStage, type GrowthStage } from './growth';

/**
 * How big Seymour currently is, derived from the whole collection's cook log.
 *
 * Derived rather than stored: there is no `stage` field anywhere, so it can't
 * drift out of step with the log, and a sync that unions two devices' cooks
 * grows him correctly without any extra merge logic.
 */
export function useGrowthStage(): GrowthStage {
  const recipes = useRecipeStore((s) => s.recipes);
  return useMemo(
    () => growthStage(Object.values(recipes).reduce((sum, r) => sum + cookCount(r), 0)),
    [recipes],
  );
}
