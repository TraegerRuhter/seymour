'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ShoppingListItem } from '@/lib/types';
import { useShoppingStore } from '@/lib/stores';
import { displayUnit, formatQuantity } from '@/lib/units';

/** Naive pluralizer for unitless counts: "6 egg" → "6 eggs". */
function pluralizeName(name: string): string {
  const last = name.split(' ').pop() ?? '';
  if (/(s|sh|ch|x|z)$/.test(last)) return name + 'es';
  if (/[^aeiou]y$/.test(last)) return name.slice(0, -1) + 'ies';
  return name + 's';
}

function itemLabel(item: ShoppingListItem): string {
  if (item.manualOverride) return item.manualOverride;
  const qty = formatQuantity(item.totalQuantity);
  const unit = displayUnit(item.unit, item.totalQuantity);
  const name =
    !item.unit && item.totalQuantity > 1
      ? pluralizeName(item.ingredientName)
      : item.ingredientName;
  return [qty, unit, name].filter(Boolean).join(' ');
}

/**
 * The animated checkbox: on check, an SVG checkmark draws itself while a
 * strikethrough line slides across the label; the row then relocates to the
 * "Checked" section via a shared layout animation.
 */
function Row({ item, editable }: { item: ShoppingListItem; editable: boolean }) {
  const toggleChecked = useShoppingStore((s) => s.toggleChecked);
  const setOverride = useShoppingStore((s) => s.setOverride);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const label = itemLabel(item);
  const inputId = `shop-${item.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ layout: { type: 'spring', stiffness: 500, damping: 40 } }}
      className="glass-card flex items-center gap-3 px-4 py-3"
    >
      <span className="relative inline-flex h-6 w-6 shrink-0">
        <input
          type="checkbox"
          id={inputId}
          checked={item.checked}
          onChange={() => toggleChecked(item.id)}
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
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        </svg>
      </span>

      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setOverride(item.id, draft);
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
          className={`relative min-w-0 flex-1 cursor-pointer select-none transition-opacity ${
            item.checked ? 'opacity-50' : ''
          }`}
        >
          <span className="block truncate">
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
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="absolute left-0 top-1/2 h-0.5 w-full origin-left bg-charcoal/60"
          />
        </label>
      )}

      {editable && !editing && !item.checked && (
        <button
          type="button"
          onClick={() => {
            setDraft(item.manualOverride ?? label);
            setEditing(true);
          }}
          aria-label={`Edit ${item.ingredientName}`}
          className="rounded-full p-1.5 text-charcoal/40 transition-colors hover:bg-charcoal/5 hover:text-charcoal"
        >
          ✏️
        </button>
      )}
    </motion.li>
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

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const visible = limit ? unchecked.slice(0, limit) : unchecked;

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-charcoal/20 p-6 text-center text-charcoal/50">
        Your shopping list is empty. Generate a meal plan and it will fill itself in.
      </p>
    );
  }

  return (
    <div>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {visible.map((item) => (
            <Row key={item.id} item={item} editable={editable} />
          ))}
        </AnimatePresence>
        {limit && unchecked.length > limit && (
          <li className="px-4 py-1 text-sm text-charcoal/50">
            +{unchecked.length - limit} more item{unchecked.length - limit === 1 ? '' : 's'}
          </li>
        )}
      </ul>

      {!limit && checked.length > 0 && (
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
