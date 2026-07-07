'use client';

import Link from 'next/link';
import { usePlanStore, useRecipeStore, useShoppingStore } from '@/lib/stores';
import RecipeCard from '@/components/RecipeCard';
import ShoppingList from '@/components/ShoppingList';

export default function DashboardPage() {
  const recipes = useRecipeStore((s) => s.recipes);
  const plan = usePlanStore((s) => s.plan);
  const items = useShoppingStore((s) => s.items);

  const recipeList = Object.values(recipes).sort(
    (a, b) => +new Date(b.dateAdded) - +new Date(a.dateAdded),
  );
  const remaining = items.filter((i) => !i.checked).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">RecipeBoard</h1>
        <p className="mt-1 text-charcoal/60">
          {recipeList.length === 0
            ? 'Save your first recipe to get cooking.'
            : `${recipeList.length} recipe${recipeList.length === 1 ? '' : 's'} in your collection.`}
        </p>
      </header>

      <section aria-label="Quick actions" className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/add"
          className="glass-card flex items-center gap-4 p-5 transition-shadow hover:shadow-card-hover"
        >
          <span aria-hidden className="text-3xl">📥</span>
          <div>
            <h2 className="text-xl font-semibold">Add recipes</h2>
            <p className="text-sm text-charcoal/60">Paste URLs or enter one by hand</p>
          </div>
        </Link>
        <Link
          href="/plan"
          className="glass-card flex items-center gap-4 p-5 transition-shadow hover:shadow-card-hover"
        >
          <span aria-hidden className="text-3xl">🎲</span>
          <div>
            <h2 className="text-xl font-semibold">
              {plan ? 'View meal plan' : 'Generate meal plan'}
            </h2>
            <p className="text-sm text-charcoal/60">
              {plan ? `${plan.length} day${plan.length === 1 ? '' : 's'} planned` : 'Random picks from your collection'}
            </p>
          </div>
        </Link>
      </section>

      {recipeList.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-charcoal/20 p-10 text-center">
          <span aria-hidden className="text-5xl">👨‍🍳</span>
          <h2 className="mt-3 text-xl font-semibold">Your kitchen is empty</h2>
          <p className="mx-auto mt-1 max-w-sm text-charcoal/60">
            Paste a recipe URL and RecipeBoard will pull out the title, ingredients, and steps for you.
          </p>
          <Link href="/add" className="btn-primary mt-4">
            Add your first recipe
          </Link>
        </section>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_minmax(280px,360px)]">
          <section aria-label="Recent recipes">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">Recent recipes</h2>
              <Link href="/recipes" className="text-sm font-medium text-terracotta hover:underline">
                View all
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {recipeList.slice(0, 6).map((r) => (
                <RecipeCard key={r.id} recipe={r} />
              ))}
            </div>
          </section>

          <section aria-label="Shopping list preview">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">Shopping list</h2>
              <Link href="/shopping-list" className="text-sm font-medium text-terracotta hover:underline">
                View full list
              </Link>
            </div>
            {remaining > 0 && (
              <p className="mb-2 text-sm text-charcoal/60">
                {remaining} item{remaining === 1 ? '' : 's'} to pick up
              </p>
            )}
            <ShoppingList limit={5} editable={false} />
          </section>
        </div>
      )}
    </div>
  );
}
