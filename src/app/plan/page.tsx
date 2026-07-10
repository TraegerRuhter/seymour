'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlanStore, useRecipeStore } from '@/lib/stores';
import { archiveCurrentPlan, clearCurrentPlan, regeneratePlan } from '@/lib/actions';
import MealPlanView from '@/components/MealPlanView';
import PlanGenerator from '@/components/PlanGenerator';
import ArchivedPlans from '@/components/ArchivedPlans';
import { PlanIcon, ShuffleIcon, ArchiveIcon, TrashIcon } from '@/components/icons';

export default function PlanPage() {
  const recipeCount = useRecipeStore((s) => Object.keys(s.recipes).length);
  const plan = usePlanStore((s) => s.plan);

  // Generator is tucked away when a plan exists so the plan itself is what you
  // see; "New plan" reveals it.
  const [showGenerator, setShowGenerator] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Meal plan</h1>
          <p className="mt-1 text-charcoal/60">
            {plan
              ? `${plan.length} day${plan.length === 1 ? '' : 's'} planned`
              : `Random picks from your ${recipeCount} recipe${recipeCount === 1 ? '' : 's'} — no repeats within a day.`}
          </p>
        </div>
        {plan && (
          <button
            type="button"
            onClick={() => setShowGenerator((v) => !v)}
            aria-expanded={showGenerator}
            className={showGenerator ? 'btn-secondary' : 'btn-primary'}
          >
            {showGenerator ? 'Close' : '＋ New plan'}
          </button>
        )}
      </header>

      {recipeCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-charcoal/20 p-10 text-center">
          <PlanIcon className="animate-float mx-auto h-16 w-16" />
          <p className="mt-3 text-charcoal/60">
            You need some recipes first —{' '}
            <Link href="/add" className="font-medium text-terracotta hover:underline">
              add a few
            </Link>{' '}
            and come back.
          </p>
        </div>
      ) : !plan ? (
        // No plan yet: generator is the main event.
        <PlanGenerator />
      ) : (
        <>
          {/* Plan actions */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={regeneratePlan} className="btn-secondary px-4 py-2 text-sm">
              <ShuffleIcon className="h-4 w-4" /> Shuffle
            </button>
            <button
              type="button"
              onClick={archiveCurrentPlan}
              className="btn-secondary px-4 py-2 text-sm"
            >
              <ArchiveIcon className="h-4 w-4" /> Archive
            </button>
            {confirmClear ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-terracotta/10 px-3 py-1.5 text-sm">
                Delete this plan?
                <button
                  type="button"
                  onClick={() => {
                    clearCurrentPlan();
                    setConfirmClear(false);
                  }}
                  className="font-semibold text-terracotta-dark hover:underline"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-charcoal/60 hover:underline"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-terracotta-dark transition-colors hover:bg-terracotta/10"
              >
                <TrashIcon className="h-4 w-4" /> Delete
              </button>
            )}
          </div>

          {/* Collapsible generator */}
          <AnimatePresence initial={false}>
            {showGenerator && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <PlanGenerator hasExistingPlan onGenerated={() => setShowGenerator(false)} />
              </motion.div>
            )}
          </AnimatePresence>

          <MealPlanView />
        </>
      )}

      <ArchivedPlans />
    </div>
  );
}
