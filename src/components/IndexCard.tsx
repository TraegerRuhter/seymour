'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Recipe } from '@/lib/types';
import { cardExit, enter, fadeRise, layoutSpring } from '@/lib/motion';
import {
  cookCount,
  describeCookCount,
  describeLastCooked,
  lastCookedAt,
  markVariant,
  wearLevel,
} from '@/lib/cook-log';
import { displayUnit, formatQuantity } from '@/lib/units';
import { MEAL_TYPE_LABELS } from '@/lib/plan';

/**
 * A recipe as an index card from a recipe box — the first surface built in
 * the "Recipe Box" direction (docs/design-prospectus.md §4B).
 *
 * The material lives in globals.css under `.index-card`, scoped so the rest
 * of the app keeps its existing palette until this has earned its place.
 *
 * The thing that makes this more than a skin: a card visibly ages with use.
 * Wear is never decorative — every mark is a render of the cook log, so the
 * cards you actually cook from look different from the ones you merely saved.
 */

/** Ingredients shown before the card falls back to "+ N more". */
const PREVIEW_LINES = 4;

export default function IndexCard({ recipe }: { recipe: Recipe }) {
  const cooks = cookCount(recipe);
  const wear = wearLevel(cooks);
  const preview = recipe.ingredients.slice(0, PREVIEW_LINES);
  const remaining = recipe.ingredients.length - preview.length;
  // The eyebrow is the card's filing label. A literal "Recipe" on every card
  // is noise, so fall back to a meal type and then to nothing — the row keeps
  // its height either way so the red rule stays put.
  const filedAs =
    recipe.category || (recipe.mealTypes?.[0] && MEAL_TYPE_LABELS[recipe.mealTypes[0]]) || '';
  const added = new Date(recipe.dateAdded).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

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
        className="index-card"
        data-wear={wear}
        data-variant={markVariant(recipe.id)}
      >
        {/* Wear sits behind the text, so a well-loved card never becomes
            harder to read than a new one. */}
        {wear !== 'pristine' && <span aria-hidden className="ic-mark ic-mark--ring" />}
        {(wear === 'worn' || wear === 'loved') && (
          <span aria-hidden className="ic-mark ic-mark--blot" />
        )}
        {wear === 'loved' && <span aria-hidden className="ic-corner" />}

        {recipe.imageUrl && (
          <span className="ic-photo">
            {/* Plain <img>: recipe images live on arbitrary external hosts and
                are never bundled, same rationale as RecipeCard. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={recipe.imageUrl} alt="" loading="lazy" />
          </span>
        )}

        <div className={`ic-head${recipe.imageUrl ? '' : ' no-photo'}`}>
          <span className="ic-cat">{filedAs}</span>
          <h3 className="ic-title">{recipe.title}</h3>
        </div>

        <div className="ic-body">
          <ul className="ic-ing">
            {preview.map((ing, i) => (
              <li key={i}>
                <span className="q">
                  {formatQuantity(ing.quantity)} {displayUnit(ing.unit, ing.quantity)}
                </span>
                <span className="n">{ing.name}</span>
              </li>
            ))}
          </ul>
          {remaining > 0 && <p className="ic-more">+ {remaining} more</p>}
        </div>

        <div className="ic-foot">
          <span>{cooks > 0 ? describeLastCooked(lastCookedAt(recipe)) : `Filed ${added}`}</span>
          <span className="ic-tally">{describeCookCount(cooks)}</span>
        </div>
      </Link>
    </motion.div>
  );
}

/** The same recipe as a filed row, for the library's list view. */
export function IndexRow({ recipe }: { recipe: Recipe }) {
  const cooks = cookCount(recipe);
  return (
    <motion.div
      layout
      variants={fadeRise}
      initial="initial"
      animate="animate"
      exit={cardExit}
      transition={{ ...enter, layout: layoutSpring }}
    >
      <Link href={`/recipes/${recipe.id}`} className="index-row block text-charcoal/80">
        <span className="truncate font-medium">{recipe.title}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-charcoal/70">
          {cooks > 0 ? describeCookCount(cooks) : '—'}
        </span>
      </Link>
    </motion.div>
  );
}
