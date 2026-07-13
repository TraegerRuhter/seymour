'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePlanStore, useRecipeStore, useShoppingStore } from '@/lib/stores';
import { MEAL_TYPE_LABELS, toLocalDateString } from '@/lib/plan';
import RecipeCard from '@/components/RecipeCard';
import ShoppingList from '@/components/ShoppingList';
import { InboxIcon, DiceIcon, ChefPlantIcon, MEAL_TYPE_ICON } from '@/components/icons';

export default function DashboardPage() {
  const recipes = useRecipeStore((s) => s.recipes);
  const plan = usePlanStore((s) => s.plan);
  const items = useShoppingStore((s) => s.items);

  const recipeList = useMemo(
    () =>
      Object.values(recipes).sort(
        (a, b) => +new Date(b.dateAdded) - +new Date(a.dateAdded),
      ),
    [recipes],
  );
  const remaining = useMemo(() => items.filter((i) => !i.checked).length, [items]);
  const today = useMemo(() => plan?.find((d) => d.date === toLocalDateString(new Date())), [plan]);
  const todayMeals = useMemo(
    () => today?.meals.filter((m) => m.recipeId && recipes[m.recipeId]) ?? [],
    [recipes, today],
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">
          {recipeList.length === 0 ? 'Welcome to Seymour' : 'Feed me, Seymour'}
        </h1>
        <p className="mt-1 text-charcoal/60">
          {recipeList.length === 0
            ? 'Save your first recipe and Seymour will do the rest.'
            : `${recipeList.length} recipe${recipeList.length === 1 ? '' : 's'} in your collection.`}
        </p>
      </header>

      {todayMeals.length > 0 && (
        <section aria-label="Today's meals">
          <h2 className="mb-3 text-xl font-semibold">On the menu today</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {todayMeals.map((meal) => {
              const recipe = recipes[meal.recipeId];
              const MealIcon = MEAL_TYPE_ICON[meal.type];
              return (
                <Link
                  key={meal.type}
                  href={`/recipes/${recipe.id}`}
                  className="glass-card flex items-center gap-3 p-3 transition-shadow hover:shadow-card-hover"
                >
                  {recipe.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recipe.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-olive/15">
                      <MealIcon className="h-6 w-6" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-charcoal/40">
                      {MEAL_TYPE_LABELS[meal.type]}
                    </p>
                    <p className="truncate text-sm font-semibold">{recipe.title}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section aria-label="Quick actions" className="grid gap-4 sm:grid-cols-2">
        <div className="glass-card flex items-center gap-4 p-5">
          <InboxIcon className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Add recipes</h2>
            <p className="text-sm text-charcoal/60">
              <Link href="/add" className="font-medium text-terracotta hover:underline">
                Paste a URL
              </Link>{' '}
              or{' '}
              <Link href="/add?mode=manual" className="font-medium text-terracotta hover:underline">
                enter one by hand
              </Link>
            </p>
          </div>
        </div>
        <Link
          href="/plan"
          className="glass-card flex items-center gap-4 p-5 transition-shadow hover:shadow-card-hover"
        >
          <DiceIcon className="h-9 w-9 shrink-0" />
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
          <ChefPlantIcon className="animate-float mx-auto h-16 w-16" />
          <h2 className="mt-3 text-xl font-semibold">Your kitchen is empty</h2>
          <p className="mx-auto mt-1 max-w-sm text-charcoal/60">
            Paste a recipe URL and Seymour will pull out the title, ingredients, and steps for you.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/add" className="btn-primary">
              Add from a URL
            </Link>
            <Link href="/add?mode=manual" className="btn-secondary">
              Enter manually
            </Link>
          </div>
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
