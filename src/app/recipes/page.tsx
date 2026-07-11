'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { useRecipeStore } from '@/lib/stores';
import RecipeCard from '@/components/RecipeCard';
import { PencilIcon, PlateIcon, GridIcon, ListIcon } from '@/components/icons';

export default function RecipeLibraryPage() {
  const recipes = useRecipeStore((s) => s.recipes);
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');

  const sortedRecipes = useMemo(
    () =>
      Object.values(recipes).sort(
        (a, b) => +new Date(b.dateAdded) - +new Date(a.dateAdded),
      ),
    [recipes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sortedRecipes.filter((r) => r.title.toLowerCase().includes(q)) : sortedRecipes;
  }, [sortedRecipes, query]);

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
          {layout === 'grid' ? <ListIcon className="h-5 w-5" /> : <GridIcon className="h-5 w-5" />}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-charcoal/20 p-10 text-center">
          <PlateIcon className="animate-float mx-auto h-16 w-16" />
          <p className="mt-3 text-charcoal/60">
            {query
              ? `No recipes match “${query}”.`
              : 'No recipes yet — add your first one to get started.'}
          </p>
          {!query && (
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
