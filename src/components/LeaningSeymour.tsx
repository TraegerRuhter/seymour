'use client';

import { useEffect, useRef, useState } from 'react';
import Logo from './Logo';
import { useGrowthStage } from '@/lib/use-growth';

const LEAN_MS = 900;
/** How long he stays after settling, before going again. */
const LINGER_MS = 1400;

/**
 * Seymour, who turns to look when a plan lands.
 *
 * The second half of the prospectus's "reactive motion at thresholds" (§6.10);
 * the chomp on the shopping list was the first. Deliberately a different
 * gesture at a different speed — a chomp is a snap, a lean is a look — because
 * two thresholds that produce the same wiggle read as one generic animation
 * attached to nothing in particular.
 *
 * `seed` is the plan config's seed, which changes when and only when a plan is
 * generated. Shuffle and "fill empty" reuse the existing config, so they draw
 * new meals without landing a new plan, and they don't set this off. That
 * distinction is the whole reason this is keyed off the seed rather than off
 * the plan array: a mascot that reacted to every re-roll would be furniture
 * inside a minute.
 *
 * He is on screen only for the reaction. The chomp's Seymour stays because a
 * finished shopping list is a rare, terminal state worth marking; a plan
 * existing is the ordinary state of this page, so the same treatment here
 * would be a permanent decoration rather than a moment.
 */
export default function LeaningSeymour({
  seed,
  className = 'h-9 w-9',
}: {
  seed: number | undefined;
  className?: string;
}) {
  const stage = useGrowthStage();
  const [leaning, setLeaning] = useState(false);
  const [visible, setVisible] = useState(false);
  // Seeded with the value at mount, so arriving at a page that already has a
  // plan is not mistaken for one landing. Same guard as ChompingSeymour's.
  const seen = useRef(seed);

  useEffect(() => {
    if (seed === seen.current) return;
    seen.current = seed;
    // Clearing a plan is not a landing.
    if (seed === undefined) return;

    setVisible(true);
    setLeaning(true);
    const settle = setTimeout(() => setLeaning(false), LEAN_MS);
    const leave = setTimeout(() => setVisible(false), LEAN_MS + LINGER_MS);
    return () => {
      clearTimeout(settle);
      clearTimeout(leave);
    };
  }, [seed]);

  return (
    // The slot keeps its size whether or not he's in it, so arriving and
    // leaving can't nudge the line of text he sits at the end of.
    <span aria-hidden className={`inline-flex shrink-0 items-center ${className}`}>
      {visible && (
        // The fade and the lean sit on separate elements on purpose. An
        // element has one `animation`, and two rules both setting it don't
        // merge — the later one replaces the earlier. With both classes on the
        // Logo, `sey-arrive` won and `sey-lean` never ran: a probe mid-lean
        // read `transform: none` while the leaves, matched by a descendant
        // selector, turned quite happily without it.
        <span className="sey-arrive inline-flex h-full w-full">
          <Logo stage={stage} className={`h-full w-full${leaning ? ' sey-leaning' : ''}`} />
        </span>
      )}
    </span>
  );
}
