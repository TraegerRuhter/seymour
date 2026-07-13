'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Recipe } from '@/lib/types';
import { cardExit, enter, fadeRise, layoutSpring } from '@/lib/motion';
import { BowlIcon } from './icons';

export default function RecipeCard({
  recipe,
  layout = 'grid',
}: {
  recipe: Recipe;
  layout?: 'grid' | 'list';
}) {
  const added = new Date(recipe.dateAdded).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (layout === 'list') {
    return (
      <motion.div
        layout
        variants={fadeRise}
        initial="initial"
        animate="animate"
        exit={cardExit}
        transition={{ ...enter, layout: layoutSpring }}
      >
        <Link
          href={`/recipes/${recipe.id}`}
          className="glass-card flex items-center gap-3 p-3 transition-shadow hover:shadow-card-hover"
        >
          <Thumb recipe={recipe} className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{recipe.title}</h3>
            <p className="text-sm text-charcoal/50">Added {added}</p>
          </div>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      variants={fadeRise}
      initial="initial"
      animate="animate"
      exit={cardExit}
      transition={{ ...enter, layout: layoutSpring }}
    >
      {/* Hover-lift lives in CSS, not a framer `whileHover`, so it never
          fights the `layout` projection over the transform (that conflict
          made cards jump when the grid reflowed during a hover). */}
      <Link
        href={`/recipes/${recipe.id}`}
        className="glass-card block overflow-hidden transition-[transform,box-shadow] duration-200 will-change-transform hover:-translate-y-1 hover:shadow-card-hover"
      >
        <Thumb recipe={recipe} className="aspect-[4/3] w-full" rounded={false} />
        <div className="p-4">
          {(recipe.category || recipe.cookTimeMinutes != null) && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {recipe.category && (
                <span className="rounded-full bg-terracotta/10 px-2 py-0.5 text-xs font-medium text-terracotta-dark">
                  {recipe.category}
                </span>
              )}
              {recipe.cookTimeMinutes != null && (
                <span className="rounded-full bg-olive/10 px-2 py-0.5 text-xs font-medium text-olive-dark">
                  {recipe.cookTimeMinutes} min
                </span>
              )}
            </div>
          )}
          <h3 className="line-clamp-2 text-xl font-semibold leading-snug">{recipe.title}</h3>
          <p className="mt-1 text-sm text-charcoal/50">
            {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? '' : 's'} ·
            Added {added}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

function Thumb({
  recipe,
  className,
  rounded = true,
}: {
  recipe: Recipe;
  className: string;
  rounded?: boolean;
}) {
  if (recipe.imageUrl) {
    return (
      // Plain <img>: recipe images live on arbitrary external hosts and are
      // never bundled; next/image optimization adds nothing for a PWA that
      // caches them via the service worker.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={recipe.imageUrl}
        alt=""
        loading="lazy"
        className={`${className} object-cover ${rounded ? '' : 'rounded-none'}`}
      />
    );
  }
  return (
    <div aria-hidden className={`${className} flex items-center justify-center bg-olive/15`}>
      <BowlIcon className="h-1/2 w-1/2 max-h-12 max-w-12 opacity-80" />
    </div>
  );
}
