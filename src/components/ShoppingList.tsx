'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import type { Recipe, ShoppingListItem } from '@/lib/types';
import { useRecipeStore, useShoppingStore } from '@/lib/stores';
import { addPantryStaple, setShoppingItemOverride, toggleShoppingItem } from '@/lib/actions';
import { displayUnit, formatAmount } from '@/lib/units';
import { categorize, CATEGORY_ORDER, type Category } from '@/lib/categories';
import { DURATION, EASE, enter, fadeRise, layoutSpring, listRowExit } from '@/lib/motion';
import {
  ProduceIcon,
  MeatIcon,
  DairyIcon,
  BakeryIcon,
  FrozenIcon,
  PantryIcon,
  SpicesIcon,
  BasketIcon,
  MoreIcon,
  PencilIcon,
  RecipesIcon,
  SparkleIcon,
  type IconComponent,
} from './icons';

/** Naive pluralizer for unitless counts: "6 egg" → "6 eggs". */
function pluralizeName(name: string): string {
  const last = name.split(' ').pop() ?? '';
  if (/(s|sh|ch|x|z)$/.test(last)) return name + 'es';
  if (/[^aeiou]y$/.test(last)) return name.slice(0, -1) + 'ies';
  return name + 's';
}

function itemLabel(item: ShoppingListItem): string {
  if (item.manualOverride) return item.manualOverride;
  const qty = formatAmount(item.totalQuantity, item.unit);
  const unit = displayUnit(item.unit, item.totalQuantity);
  const name =
    !item.unit && item.totalQuantity > 1 ? pluralizeName(item.ingredientName) : item.ingredientName;
  return [qty, unit, name].filter(Boolean).join(' ');
}

const CATEGORY_ICON: Record<Category, IconComponent> = {
  Produce: ProduceIcon,
  'Meat & Seafood': MeatIcon,
  'Dairy & Eggs': DairyIcon,
  Bakery: BakeryIcon,
  Frozen: FrozenIcon,
  Pantry: PantryIcon,
  'Spices & Seasonings': SpicesIcon,
  Other: BasketIcon,
};

/**
 * Overflow menu for a row's actions: view the source recipe(s), quick-add
 * the ingredient to the pantry ("spice rack"), and edit. Split into an
 * explicit link per source recipe rather than a single "view" affordance —
 * a shared icon that either navigated directly (one source) or expanded a
 * list (several) read as "the button only goes to one recipe" when there
 * were actually more, since nothing distinguished the two behaviors.
 */
function RowMenu({
  item,
  sourceRecipes,
  editable,
  onEdit,
}: {
  item: ShoppingListItem;
  sourceRecipes: Recipe[];
  editable: boolean;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Portaled to <body> and positioned via getBoundingClientRect rather than
  // a plain `absolute` popover anchored in place — the list's rows each sit
  // in their own framer-motion `layout` stacking context, so a same-subtree
  // popover could render *behind* a later row's category section and eat
  // its own clicks. Fixed positioning sidesteps that entirely.
  //
  // Flips upward for a row near the bottom of the viewport (common with a
  // long list) so the menu never opens off-screen.
  function updatePosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const MENU_HEIGHT_ESTIMATE = 220; // generous for up to ~5 entries
    const openUpward =
      window.innerHeight - rect.bottom < MENU_HEIGHT_ESTIMATE && rect.top > MENU_HEIGHT_ESTIMATE;
    setCoords({
      right: window.innerWidth - rect.right,
      ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
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
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`More actions for ${item.ingredientName}`}
        className="shrink-0 rounded-full p-1.5 text-charcoal/40 transition-colors hover:bg-charcoal/5 hover:text-charcoal"
      >
        <MoreIcon className="h-5 w-5" />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: coords.top, bottom: coords.bottom, right: coords.right }}
            className="fixed z-50 w-56 overflow-hidden rounded-xl border border-charcoal/10 bg-surface py-1 shadow-card-hover"
          >
            {sourceRecipes.map((r) => (
              <Link
                key={r.id}
                href={`/recipes/${r.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-charcoal hover:bg-charcoal/5"
              >
                <RecipesIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {sourceRecipes.length > 1 ? `View: ${r.title}` : `View recipe: ${r.title}`}
                </span>
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                addPantryStaple(item.ingredientName);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-charcoal hover:bg-charcoal/5"
            >
              <SpicesIcon className="h-4 w-4 shrink-0" />
              Add to spice rack
            </button>
            {editable && !item.checked && (
              <button
                type="button"
                onClick={() => {
                  onEdit();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-charcoal hover:bg-charcoal/5"
              >
                <PencilIcon className="h-4 w-4 shrink-0" />
                Edit
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * The animated checkbox: on check, an SVG checkmark draws itself while a
 * strikethrough line slides across the label; the row then relocates to the
 * "Checked" section via a shared layout animation.
 */
function Row({ item, editable }: { item: ShoppingListItem; editable: boolean }) {
  const recipes = useRecipeStore((s) => s.recipes);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const labelTextRef = useRef<HTMLSpanElement>(null);

  const label = itemLabel(item);
  const inputId = `shop-${item.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const sourceRecipes = (item.recipeIds ?? []).map((id) => recipes[id]).filter((r) => r != null);

  return (
    <motion.li
      layout
      variants={fadeRise}
      initial="initial"
      animate="animate"
      exit={listRowExit}
      transition={{ ...enter, layout: layoutSpring }}
      className="glass-card flex items-start gap-3 px-4 py-3"
    >
      <span className="relative inline-flex h-6 w-6 shrink-0">
        <input
          type="checkbox"
          id={inputId}
          checked={item.checked}
          onChange={() => toggleShoppingItem(item.id)}
          className="peer absolute inset-0 h-6 w-6 cursor-pointer appearance-none rounded-full border-2 border-charcoal/25 transition-colors checked:border-olive checked:bg-olive"
        />
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="pointer-events-none absolute inset-0 h-6 w-6 p-1 text-white"
        >
          <motion.path
            d="M5 13l4 4L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: item.checked ? 1 : 0, opacity: item.checked ? 1 : 0 }}
            transition={{ duration: DURATION, ease: EASE }}
          />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setShoppingItemOverride(item.id, draft);
              setEditing(false);
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Edit ${item.ingredientName}`}
              className="input-base py-1.5 text-sm"
            />
            <button type="submit" className="btn-primary px-3 py-1.5 text-sm">
              Save
            </button>
          </form>
        ) : (
          <label
            htmlFor={inputId}
            onClick={(e) => {
              // A tap meant to read a truncated name shouldn't also check the
              // item off — reveal the full text first, and only let a second
              // tap (now that it's no longer truncated) reach the checkbox.
              const el = labelTextRef.current;
              const isTruncated = !!el && el.scrollWidth > el.clientWidth;
              if (isTruncated && !expanded) {
                e.preventDefault();
                setExpanded(true);
              }
            }}
            className={`relative block cursor-pointer select-none transition-opacity ${
              item.checked ? 'opacity-50' : ''
            }`}
          >
            <span ref={labelTextRef} className={`block ${expanded ? '' : 'truncate'}`}>
              {label}
              {item.manualOverride && (
                <span className="ml-2 rounded-full bg-terracotta/10 px-2 py-0.5 text-xs text-terracotta">
                  edited
                </span>
              )}
            </span>
            <motion.span
              aria-hidden
              initial={false}
              animate={{ scaleX: item.checked ? 1 : 0 }}
              transition={{ duration: DURATION, ease: EASE }}
              className="absolute left-0 top-1/2 h-0.5 w-full origin-left bg-charcoal/60"
            />
          </label>
        )}

        {!editing && item.sources && item.sources.length > 1 && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              aria-expanded={showBreakdown}
              className="flex items-center gap-1 text-xs text-charcoal/50 hover:text-charcoal/70"
            >
              <span
                aria-hidden
                className={`inline-block transition-transform ${showBreakdown ? 'rotate-90' : ''}`}
              >
                ▸
              </span>
              Why this many?
            </button>
            {showBreakdown && (
              <ul className="mt-1 space-y-0.5 border-l-2 border-charcoal/10 pl-3">
                {item.sources.map((s) => (
                  <li key={s.originalString} className="truncate text-xs text-charcoal/60">
                    {s.originalString}
                    {s.recipeId && recipes[s.recipeId] && (
                      <span className="text-charcoal/40"> · {recipes[s.recipeId].title}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {!editing && (
        <RowMenu
          item={item}
          sourceRecipes={sourceRecipes}
          editable={editable}
          onEdit={() => {
            setDraft(item.manualOverride ?? label);
            setEditing(true);
          }}
        />
      )}
    </motion.li>
  );
}

/**
 * How long a freshly-checked item stays put — still showing the checkmark
 * draw-in and strikethrough slide — before it relocates to the "Checked"
 * section. Without this, the item's category-group membership flips on the
 * very same render that sets `checked: true`, so it unmounts from its
 * original spot before the affirmation animation ever gets a frame to play;
 * checking something off just makes it vanish instead of feeling confirmed.
 */
const CHECK_LINGER_MS = 650;

/**
 * Tracks which just-checked item ids should still render in their original
 * (unchecked) position for `CHECK_LINGER_MS`, so `Row`'s own checkmark/
 * strikethrough animation has time to play in place before the item moves.
 * Unchecking (or re-checking during the grace window) is immediate — only
 * the check→relocate transition needs the pause.
 */
function useCheckLinger(items: ShoppingListItem[]): Set<string> {
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const prevChecked = useRef(new Map<string, boolean>());

  useEffect(() => {
    const seenIds = new Set<string>();
    for (const item of items) {
      seenIds.add(item.id);
      const was = prevChecked.current.get(item.id);
      prevChecked.current.set(item.id, item.checked);

      if (item.checked && was === false) {
        setPending((p) => (p.has(item.id) ? p : new Set(p).add(item.id)));
        const timer = setTimeout(() => {
          timers.current.delete(item.id);
          setPending((p) => {
            if (!p.has(item.id)) return p;
            const next = new Set(p);
            next.delete(item.id);
            return next;
          });
        }, CHECK_LINGER_MS);
        timers.current.set(item.id, timer);
      } else if (!item.checked) {
        const timer = timers.current.get(item.id);
        if (timer) {
          clearTimeout(timer);
          timers.current.delete(item.id);
        }
        setPending((p) => {
          if (!p.has(item.id)) return p;
          const next = new Set(p);
          next.delete(item.id);
          return next;
        });
      }
    }
    // Drop timers for items no longer in the list (e.g. plan regenerated).
    for (const [id, timer] of timers.current) {
      if (!seenIds.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
  }, [items]);

  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      for (const timer of timersMap.values()) clearTimeout(timer);
    };
  }, []);

  return pending;
}

/** Animated completion bar shown above the full list. */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${done} of ${total} items collected`}
      className="h-2 w-full overflow-hidden rounded-full bg-charcoal/10"
    >
      <motion.div
        className="h-full rounded-full bg-olive"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 200, damping: 30 }}
      />
    </div>
  );
}

export default function ShoppingList({
  limit,
  editable = true,
}: {
  /** When set, renders only the first N unchecked items (dashboard preview). */
  limit?: number;
  editable?: boolean;
}) {
  const items = useShoppingStore((s) => s.items);
  const [showChecked, setShowChecked] = useState(true);
  const lingering = useCheckLinger(items);

  const unchecked = items.filter((i) => !i.checked || lingering.has(i.id));
  const checked = items.filter((i) => i.checked && !lingering.has(i.id));

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-charcoal/20 p-6 text-center text-charcoal/50">
        Your shopping list is empty. Generate a meal plan and it will fill itself in.
      </p>
    );
  }

  // Dashboard preview: compact, ungrouped, first N unchecked items.
  if (limit) {
    return (
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {unchecked.slice(0, limit).map((item) => (
            <Row key={item.id} item={item} editable={editable} />
          ))}
        </AnimatePresence>
        {unchecked.length > limit && (
          <li className="px-4 py-1 text-sm text-charcoal/50">
            +{unchecked.length - limit} more item{unchecked.length - limit === 1 ? '' : 's'}
          </li>
        )}
        {unchecked.length === 0 && (
          <li className="flex items-center gap-1.5 px-4 py-1 text-sm text-charcoal/50">
            All checked off <SparkleIcon className="h-4 w-4" />
          </li>
        )}
      </ul>
    );
  }

  // Full list: group unchecked items by store section.
  const groups = new Map<Category, ShoppingListItem[]>();
  for (const item of unchecked) {
    const cat = categorize(item.ingredientName);
    const list = groups.get(cat);
    if (list) list.push(item);
    else groups.set(cat, [item]);
  }

  return (
    <div>
      <div className="mb-5">
        <ProgressBar done={checked.length} total={items.length} />
      </div>

      {CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((cat) => {
        const CategoryIcon = CATEGORY_ICON[cat];
        const catItems = groups.get(cat)!;
        return (
          <section key={cat} aria-label={cat} className="mb-5">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-charcoal/50">
              <CategoryIcon className="h-5 w-5" />
              {cat}
              <span className="font-normal normal-case tracking-normal">· {catItems.length}</span>
            </h2>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {catItems.map((item) => (
                  <Row key={item.id} item={item} editable={editable} />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        );
      })}

      {checked.length > 0 && (
        <section className="mt-6" aria-label="Checked items">
          <button
            type="button"
            onClick={() => setShowChecked((v) => !v)}
            aria-expanded={showChecked}
            className="mb-2 flex items-center gap-2 text-sm font-medium text-charcoal/60"
          >
            <span
              aria-hidden
              className={`inline-block transition-transform ${showChecked ? 'rotate-90' : ''}`}
            >
              ▸
            </span>
            Checked ({checked.length})
          </button>
          {showChecked && (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {checked.map((item) => (
                  <Row key={item.id} item={item} editable={editable} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
