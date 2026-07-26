'use client';

import { usePlanStore } from '@/lib/stores';
import { setShoppingHorizon } from '@/lib/actions';
import { daysBeyondHorizon, fromLocalDateString } from '@/lib/plan';

/** "Mon, Aug 3" — short enough to sit inside a sentence. */
function short(date: string): string {
  return fromLocalDateString(date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The gap between what's planned and what's being shopped for, and the button
 * that closes it.
 *
 * Generating a week that starts after the plan ends adds it to the plan
 * without adding it to the shopping list — otherwise laying out next week
 * quietly doubles the list you're standing in a shop holding. This is where
 * you say you're ready for it.
 *
 * Renders nothing when the plan and the list already agree, which is most of
 * the time. It's a notice about a state you're in, not a permanent control.
 */
export default function ShoppingHorizon({ className = '' }: { className?: string }) {
  const plan = usePlanStore((s) => s.plan);
  const config = usePlanStore((s) => s.config);

  const beyond = plan ? daysBeyondHorizon(plan, config?.shoppingThrough) : [];
  if (beyond.length === 0) return null;

  const first = beyond[0].date;
  const last = beyond[beyond.length - 1].date;
  const range = first === last ? short(first) : `${short(first)} – ${short(last)}`;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-charcoal/20 px-4 py-3 ${className}`}
    >
      {/* The subject is a range, so it takes "is" whether it's one day or ten. */}
      <p className="text-sm text-charcoal/70">
        <span className="font-medium text-charcoal">{range}</span> is planned but not on the
        shopping list.
      </p>
      <button
        type="button"
        onClick={() => setShoppingHorizon(last)}
        className="btn-secondary ml-auto px-4 py-1.5 text-sm"
      >
        Add to the list
      </button>
    </div>
  );
}
