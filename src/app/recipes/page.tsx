'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { useRecipeStore } from '@/lib/stores';
import { MEAL_TYPES, type MealType } from '@/lib/types';
import { MEAL_TYPE_LABELS, recipeFitsMealType } from '@/lib/plan';
import RecipeCard from '@/components/RecipeCard';
import { PencilIcon, PlateIcon, GridIcon, ListIcon } from '@/components/icons';

/** The meal-type filter also offers "untagged" to surface recipes that still need tags. */
type MealFilter = MealType | 'untagged';

function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        on
          ? 'bg-olive text-white'
          : 'border border-charcoal/15 bg-surface/70 text-charcoal/60 hover:bg-surface hover:text-charcoal'
      }`}
    >
      {children}
    </button>
  );
}

export default function RecipeLibraryPage() {
  const recipes = useRecipeStore((s) => s.recipes);
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [mealFilter, setMealFilter] = useState<MealFilter | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const sortedRecipes = useMemo(
    () => Object.values(recipes).sort((a, b) => +new Date(b.dateAdded) - +new Date(a.dateAdded)),
    [recipes],
  );

  // Category chips come from the collection itself — grouped case-insensitively,
  // shown with the casing of their first occurrence.
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of sortedRecipes) {
      const c = r.category?.trim();
      if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [sortedRecipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedRecipes.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      if (mealFilter === 'untagged') {
        if (r.mealTypes && r.mealTypes.length > 0) return false;
      } else if (mealFilter) {
        // Same semantics as plan generation: untagged recipes fit any meal.
        if (!recipeFitsMealType(r, mealFilter)) return false;
      }
      if (categoryFilter && r.category?.trim().toLowerCase() !== categoryFilter.toLowerCase())
        return false;
      return true;
    });
  }, [sortedRecipes, query, mealFilter, categoryFilter]);

  const hasActiveFilter = query.trim() !== '' || mealFilter !== null || categoryFilter !== null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Recipes</h1>
        <div className="flex gap-2">
          <Link href="/add?mode=manual" className="btn-secondary">
            <PencilIcon className="h-5 w-5" /> Enter manually
          </Link>
          <Link href="/add" className="btn-primary">
            + Add from URL
          </Link>
        </div>
      </header>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label htmlFor="recipe-search" className="sr-only">
            Search recipes
          </label>
          <input
            id="recipe-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title…"
            className="input-base max-w-md"
          />
          <button
            type="button"
            onClick={() => setLayout((l) => (l === 'grid' ? 'list' : 'grid'))}
            aria-label={`Switch to ${layout === 'grid' ? 'list' : 'grid'} view`}
            className="btn-secondary px-4"
          >
            {layout === 'grid' ? (
              <ListIcon className="h-5 w-5" />
            ) : (
              <GridIcon className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Only worth showing filters once there's something to filter. */}
        {sortedRecipes.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter recipes"
          >
            {MEAL_TYPES.map((t) => (
              <FilterChip
                key={t}
                on={mealFilter === t}
                onClick={() => setMealFilter((cur) => (cur === t ? null : t))}
              >
                {MEAL_TYPE_LABELS[t]}
              </FilterChip>
            ))}
            <FilterChip
              on={mealFilter === 'untagged'}
              onClick={() => setMealFilter((cur) => (cur === 'untagged' ? null : 'untagged'))}
            >
              Untagged
            </FilterChip>
            {categories.length > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-charcoal/15" />}
            {categories.map((c) => (
              <FilterChip
                key={c}
                on={categoryFilter?.toLowerCase() === c.toLowerCase()}
                onClick={() =>
                  setCategoryFilter((cur) => (cur?.toLowerCase() === c.toLowerCase() ? null : c))
                }
              >
                {c}
              </FilterChip>
            ))}
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setMealFilter(null);
                  setCategoryFilter(null);
                }}
                className="ml-1 text-sm font-medium text-terracotta hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-charcoal/20 p-10 text-center">
          <PlateIcon className="animate-float mx-auto h-16 w-16" />
          <p className="mt-3 text-charcoal/60">
            {hasActiveFilter
              ? 'No recipes match these filters.'
              : 'No recipes yet — add your first one to get started.'}
          </p>
          {!hasActiveFilter && (
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link href="/add" className="btn-primary">
                Add from a URL
              </Link>
              <Link href="/add?mode=manual" className="btn-secondary">
                Enter manually
              </Link>
            </div>
          )}
        </div>
      ) : layout === 'grid' ? (
        // popLayout pulls an exiting card out of flow so the remaining cards
        // reflow smoothly as you filter, instead of popping into place.
        // initial={false} skips the entrance on first mount (the page-level
        // template already animates it in) so cards only animate on
        // filter/layout changes, not a double entrance.
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((r) => (
              <RecipeCard key={r.id} recipe={r} layout="list" />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
