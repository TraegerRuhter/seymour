'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePlanStore, useRecipeStore, useShoppingStore } from '@/lib/stores';
import { MEAL_TYPE_LABELS, toLocalDateString } from '@/lib/plan';
import RecipeCard from '@/components/RecipeCard';
import SeymourSays from '@/components/SeymourSays';
import ShoppingList from '@/components/ShoppingList';
import {
  InboxIcon,
  DiceIcon,
  ChefPlantIcon,
  CompassIcon,
  MEAL_TYPE_ICON,
} from '@/components/icons';
import { seymourSays } from '@/lib/seymour-says';
import { leadTiming, orderFromNow } from '@/lib/time-of-day';

export default function DashboardPage() {
  const recipes = useRecipeStore((s) => s.recipes);
  const plan = usePlanStore((s) => s.plan);
  const items = useShoppingStore((s) => s.items);

  const recipeList = useMemo(
    () => Object.values(recipes).sort((a, b) => +new Date(b.dateAdded) - +new Date(a.dateAdded)),
    [recipes],
  );
  const remaining = useMemo(() => items.filter((i) => !i.checked).length, [items]);
  const line = useMemo(() => seymourSays({ recipes: recipeList }), [recipeList]);
  // Read once per mount. Same reasoning as the meal ordering below: there is
  // no server pass to disagree with, because AppProviders holds children back
  // until after hydration.
  const now = useMemo(() => new Date(), []);
  const heading = useMemo(
    () => now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    [now],
  );
  const today = useMemo(() => plan?.find((d) => d.date === toLocalDateString(new Date())), [plan]);
  // Ordered by the clock rather than by the plan: at 5pm the useful answer is
  // dinner, and it used to be third in a row of four. Computed at render,
  // which is safe here because AppProviders holds children back until after
  // hydration — there is no server pass to disagree with.
  const todayMeals = useMemo(
    () =>
      orderFromNow(today?.meals.filter((m) => m.recipeId && recipes[m.recipeId]) ?? [], new Date()),
    [recipes, today],
  );
  const leading = useMemo(() => leadTiming(todayMeals[0]?.type, new Date()), [todayMeals]);

  return (
    <div className="space-y-8">
      <header>
        {/* The date, rather than a catchphrase.
            This slot used to read "Feed me, Seymour" — the same string every
            visit, directly under a wordmark saying "Seymour" and a speech
            bubble saying "feed me", with Seymour's actual, earned line demoted
            to grey italic underneath it. Three copies of the joke and a
            headline doing no work.
            A day and a date is the one thing a meal planner's home page can
            put here that you might not already know, and it's what the rest of
            the page is about: today's meals, ordered by the clock. */}
        <h1 className="text-3xl font-bold">
          <time dateTime={toLocalDateString(now)}>{heading}</time>
        </h1>
        {/* Seymour speaks when he has something earned to say; otherwise the
            header stays plain rather than manufacturing a line. */}
        {line ? (
          <SeymourSays text={line.text} />
        ) : (
          <p className="mt-1 text-charcoal/70">
            {`${recipeList.length} recipe${recipeList.length === 1 ? '' : 's'} in your collection.`}
          </p>
        )}
      </header>

      {todayMeals.length > 0 && (
        <section aria-label="Today's meals">
          <h2 className="mb-3 text-xl font-semibold">On the menu today</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {todayMeals.map((meal, i) => {
              const recipe = recipes[meal.recipeId];
              const MealIcon = MEAL_TYPE_ICON[meal.type];
              // Only the first card, and only when the clock actually backs it
              // up — calling dinner "now" at 3pm is a small lie, and a label
              // like this is worth nothing if you can't check it.
              const timing = i === 0 ? leading : undefined;
              return (
                <Link
                  // Keyed by slot id, not meal type: a day can hold two
                  // dinners (nothing stops you adding one), and keying by type
                  // gave React two children with the same key. The `?? ` covers
                  // plans saved before slots carried ids — ensureMealIds()
                  // backfills them, but not before this has already rendered.
                  key={meal.id ?? `${meal.type}-${i}`}
                  href={`/recipes/${recipe.id}`}
                  className={`glass-card flex items-center gap-3 p-3 transition-shadow hover:shadow-card-hover ${
                    timing ? 'ring-1 ring-moss/40' : ''
                  }`}
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
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-moss/12">
                      <MealIcon className="h-6 w-6" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-charcoal/70">
                      {MEAL_TYPE_LABELS[meal.type]}
                      {timing && (
                        <span className="rounded-full bg-zest px-1.5 py-px text-[10px] font-bold tracking-wider text-zest-ink">
                          {timing}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm font-semibold">{recipe.title}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Three doors, all the same size.
          Discover used to be a tab you could only reach by first deciding to
          add a recipe, which is backwards — finding something to cook and
          typing in something you already have are different errands. Each card
          is a whole link now; the old "Add recipes" card was a div with two
          links inside it, so the large obvious target did nothing. */}
      <section aria-label="Quick actions" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/add"
          className="glass-card flex items-center gap-4 p-5 transition-shadow hover:shadow-card-hover"
        >
          <InboxIcon className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Add a recipe</h2>
            <p className="text-sm text-charcoal/70">Paste a URL, or type one in</p>
          </div>
        </Link>
        <Link
          href="/add?mode=discover"
          className="glass-card flex items-center gap-4 p-5 transition-shadow hover:shadow-card-hover"
        >
          <CompassIcon className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Discover</h2>
            <p className="text-sm text-charcoal/70">Find something new to cook</p>
          </div>
        </Link>
        <Link
          href="/plan"
          className="glass-card flex items-center gap-4 p-5 transition-shadow hover:shadow-card-hover"
        >
          <DiceIcon className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">
              {plan ? 'View meal plan' : 'Generate meal plan'}
            </h2>
            <p className="text-sm text-charcoal/70">
              {plan
                ? `${plan.length} day${plan.length === 1 ? '' : 's'} planned`
                : 'Random picks from your collection'}
            </p>
          </div>
        </Link>
      </section>

      {recipeList.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-charcoal/20 p-10 text-center">
          <ChefPlantIcon className="animate-float mx-auto h-16 w-16" />
          <h2 className="mt-3 text-xl font-semibold">Nothing in the box</h2>
          <p className="mx-auto mt-1 max-w-sm text-charcoal/70">
            Paste a recipe URL and I&apos;ll pull out the title, ingredients and steps. Then we can
            talk about dinner.
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
              <Link
                href="/recipes"
                className="text-sm font-medium text-moss-strong hover:underline"
              >
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
              <Link
                href="/shopping-list"
                className="text-sm font-medium text-moss-strong hover:underline"
              >
                View full list
              </Link>
            </div>
            {remaining > 0 && (
              <p className="mb-2 text-sm text-charcoal/70">
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
