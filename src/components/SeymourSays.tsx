'use client';

import Logo from './Logo';
import { useGrowthStage } from '@/lib/use-growth';

/**
 * One remark from Seymour, on the dashboard.
 *
 * Presentational on purpose — the decision about *whether* there is anything
 * worth saying lives in lib/seymour-says.ts, so this never has to guess.
 * Deliberately quiet: the mascot at reading size next to a single line, not a
 * banner or a card. It's a comment, not an announcement.
 *
 * Tracks his growth stage for the same reason the header does: he's one
 * character, and a seedling in the corner talking next to a full-grown plant
 * two lines below reads as a bug rather than as a mascot.
 */
export default function SeymourSays({ text }: { text: string }) {
  const stage = useGrowthStage();

  return (
    <div className="mt-1.5 flex items-start gap-2.5">
      <Logo stage={stage} className="mt-0.5 h-6 w-6 shrink-0" />
      <p className="italic text-charcoal/70">{text}</p>
    </div>
  );
}
