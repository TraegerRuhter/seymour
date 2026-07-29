'use client';

import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type { ShoppingListItem } from '@/lib/types';
import { saveCorrection } from '@/lib/actions';

/**
 * "This is wrong."
 *
 * The parser is a pile of rules someone wrote down, and it will keep being
 * wrong about food nobody thought of. This is the shortest path from noticing
 * that to it being fixed — and fixed *now*, on the collection in front of you,
 * not in some future release.
 *
 * Deliberately one field. The overwhelmingly common complaint is that a row is
 * called the wrong thing — "of tomato", "kilo pork belly", "catsup" sitting
 * next to "ketchup". Asking for a quantity and a unit as well would make the
 * form something you'd put off filling in, and a report nobody files teaches
 * nothing.
 */
export default function CorrectionDialog({
  item,
  originalLines,
  onClose,
}: {
  item: ShoppingListItem;
  /** The raw recipe lines behind this row, shown so the fix is made in context. */
  originalLines: string[];
  onClose: (result?: { updated: number }) => void;
}) {
  const [name, setName] = useState(item.ingredientName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const trimmed = name.trim();
  const unchanged = trimmed === item.ingredientName;

  function submit() {
    if (!trimmed || unchanged) return onClose();
    const updated = saveCorrection({
      id: nanoid(),
      // Keyed on the name rather than the line, so it holds for every other
      // recipe that says the same thing — including ones imported later.
      kind: 'name',
      match: item.ingredientName,
      got: { name: item.ingredientName, quantity: item.totalQuantity, unit: item.unit },
      expected: { name: trimmed },
      createdAt: new Date().toISOString(),
      share: false,
    });
    onClose({ updated });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-charcoal/30 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Correct this ingredient"
        className="w-full max-w-md rounded-2xl border border-charcoal/10 bg-surface p-5 shadow-card-hover"
      >
        <h2 className="font-display text-lg text-charcoal">What should this be?</h2>

        {originalLines.length > 0 && (
          <div className="mt-3 rounded-xl bg-charcoal/[0.04] p-3">
            <p className="text-xs uppercase tracking-wide text-charcoal/60">The recipe said</p>
            <ul className="mt-1 space-y-0.5">
              {originalLines.map((line) => (
                <li key={line} className="font-mono text-xs text-charcoal/80">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="mt-4 block text-sm text-charcoal/70" htmlFor="correction-name">
          Call it
        </label>
        <input
          id="correction-name"
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="mt-1 w-full rounded-xl border border-charcoal/15 bg-surface px-3 py-2 text-charcoal focus:border-moss focus:outline-none"
        />
        <p className="mt-2 text-xs text-charcoal/60">
          Applies to every recipe that says this, now and later. You can undo it in Settings.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-full px-4 py-2 text-sm text-charcoal/70 hover:bg-charcoal/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!trimmed || unchanged}
            className="rounded-full bg-moss px-4 py-2 text-sm text-bone transition-opacity disabled:opacity-40"
          >
            Fix it
          </button>
        </div>
      </div>
    </div>
  );
}
