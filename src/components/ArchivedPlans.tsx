'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlanStore } from '@/lib/stores';
import { clearArchivedPlans, deleteArchivedPlan, restoreArchivedPlan } from '@/lib/actions';
import { TrashIcon } from './icons';

/** Collapsible list of archived plans with restore / delete. */
export default function ArchivedPlans() {
  const archived = usePlanStore((s) => s.archivedPlans);
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (archived.length === 0) return null;

  return (
    <section aria-label="Archived plans" className="pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 text-sm font-semibold text-charcoal/60"
      >
        <span aria-hidden className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>
          ▸
        </span>
        Archived plans ({archived.length})
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {archived.map((a) => (
                <motion.li
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="glass-card flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.label}</p>
                    <p className="text-xs text-charcoal/50">
                      Archived{' '}
                      {new Date(a.archivedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreArchivedPlan(a.id)}
                    className="rounded-full px-3 py-1.5 text-sm font-medium text-terracotta transition-colors hover:bg-terracotta/10"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteArchivedPlan(a.id)}
                    aria-label={`Delete archived plan: ${a.label}`}
                    className="rounded-full p-1.5 text-charcoal/40 transition-colors hover:bg-charcoal/5 hover:text-charcoal"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {confirmClear ? (
            <p className="flex items-center gap-2 text-sm text-charcoal/70">
              Delete all {archived.length} archived plans?
              <button
                type="button"
                onClick={() => {
                  clearArchivedPlans();
                  setConfirmClear(false);
                }}
                className="font-semibold text-terracotta-dark hover:underline"
              >
                Yes, delete all
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="text-charcoal/60 hover:underline"
              >
                Cancel
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="text-sm font-medium text-terracotta-dark hover:underline"
            >
              Delete all archived
            </button>
          )}
        </div>
      )}
    </section>
  );
}
