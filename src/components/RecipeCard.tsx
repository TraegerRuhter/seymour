'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Recipe } from '@/lib/types';

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
      <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
    >
      <Link
        href={`/recipes/${recipe.id}`}
        className="glass-card block overflow-hidden transition-shadow hover:shadow-card-hover"
      >
        <Thumb recipe={recipe} className="aspect-[4/3] w-full" rounded={false} />
        <div className="p-4">
          <h3 className="line-clamp-2 text-xl font-semibold leading-snug">{recipe.title}</h3>
          <p className="mt-1 text-sm text-charcoal/50">Added {added}</p>
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
    <div
      aria-hidden
      className={`${className} flex items-center justify-center bg-olive/15 text-3xl`}
    >
      🍲
    </div>
  );
}
