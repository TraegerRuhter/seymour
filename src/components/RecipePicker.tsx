'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Recipe, MealType } from '@/lib/types';
import { MEAL_TYPE_LABELS, recipeFitsMealType } from '@/lib/plan';
import { BowlIcon } from './icons';

const PANEL_HEIGHT_ESTIMATE = 360;

/**
 * A portal-based searchable recipe picker, anchored under the trigger
 * element via fixed positioning (same reasoning as ActionMenu: plan tiles
 * sit inside framer-motion `layout` stacking contexts an absolutely
 * positioned popover can't escape).
 *
 * Recipes tagged for `mealType` sort first, then everything else — the same
 * "show the natural fit, but never hide anything" fallback the old native
 * `<select>` used, just expressed as a sort instead of an all-or-nothing
 * filter.
 */
export default function RecipePicker({
  anchorRef,
  mealType,
  recipes,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  mealType: MealType;
  recipes: Recipe[];
  onPick: (recipeId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const label = MEAL_TYPE_LABELS[mealType];

  useEffect(() => {
    function updatePosition() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const openUpward =
        window.innerHeight - rect.bottom < PANEL_HEIGHT_ESTIMATE &&
        rect.top > PANEL_HEIGHT_ESTIMATE;
      setCoords({
        left: rect.left,
        width: rect.width,
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    }
    updatePosition();
    inputRef.current?.focus();
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q
      ? recipes.filter(
          (r) => r.title.toLowerCase().includes(q) || (r.category ?? '').toLowerCase().includes(q),
        )
      : recipes;
    return [...matching].sort((a, b) => {
      const fitDiff =
        Number(!recipeFitsMealType(a, mealType)) - Number(!recipeFitsMealType(b, mealType));
      return fitDiff !== 0 ? fitDiff : a.title.localeCompare(b.title);
    });
  }, [recipes, query, mealType]);

  if (!coords) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        left: coords.left,
        width: Math.max(coords.width, 280),
        top: coords.top,
        bottom: coords.bottom,
      }}
      className="fixed z-50 flex max-h-[360px] flex-col overflow-hidden rounded-xl border border-charcoal/10 bg-surface shadow-card-hover"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search recipes for ${label.toLowerCase()}…`}
        aria-label={`Search recipes for ${label}`}
        className="input-base m-2 py-1.5 text-sm"
      />
      <ul role="listbox" aria-label={`Recipes for ${label}`} className="overflow-y-auto px-1 pb-1">
        {results.map((r) => {
          const fits = recipeFitsMealType(r, mealType);
          return (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onPick(r.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-charcoal/5"
              >
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-9 w-9 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-olive/15">
                    <BowlIcon className="h-5 w-5 opacity-80" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm font-medium ${fits ? '' : 'text-charcoal/60'}`}
                  >
                    {r.title}
                  </span>
                  {(r.category || !fits) && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {r.category && (
                        <span className="rounded-full bg-terracotta/10 px-1.5 py-0 text-[10px] font-medium text-terracotta-dark">
                          {r.category}
                        </span>
                      )}
                      {!fits &&
                        r.mealTypes?.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-charcoal/10 px-1.5 py-0 text-[10px] font-medium text-charcoal/50"
                          >
                            {MEAL_TYPE_LABELS[t]}
                          </span>
                        ))}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {results.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-charcoal/40">
            No recipes match &ldquo;{query}&rdquo;
          </p>
        )}
      </ul>
    </div>,
    document.body,
  );
}
