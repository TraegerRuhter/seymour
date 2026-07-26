'use client';

import { useEffect, useRef, useState } from 'react';
import Logo from './Logo';
import { useGrowthStage } from '@/lib/use-growth';

const CHOMP_MS = 700;

/**
 * Seymour, who snaps his jaws shut the moment `done` becomes true.
 *
 * Only on the *transition*. Arriving at a page that's already finished gets
 * you a still mascot — the reaction is to the thing you just did, and firing
 * it on every visit would turn a moment into wallpaper.
 *
 * The animation itself is CSS (see `.sey-chomping` in globals.css), so this
 * component is only responsible for knowing when it should run.
 */
export default function ChompingSeymour({
  done,
  className = 'h-6 w-6',
}: {
  done: boolean;
  className?: string;
}) {
  const stage = useGrowthStage();
  const [chomping, setChomping] = useState(false);
  const wasDone = useRef(done);

  useEffect(() => {
    const justFinished = done && !wasDone.current;
    wasDone.current = done;
    if (!justFinished) return;
    setChomping(true);
    const timer = setTimeout(() => setChomping(false), CHOMP_MS);
    return () => clearTimeout(timer);
  }, [done]);

  // Renders nothing until the list is finished, but stays mounted the whole
  // time so the ref above can actually see the flip. Mounting it only once
  // `done` was already true would mean the first thing it ever observed was
  // the finished state, and it would never fire.
  if (!done) return null;

  return <Logo stage={stage} className={`${className}${chomping ? ' sey-chomping' : ''}`} />;
}
