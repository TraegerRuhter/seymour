'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps the screen awake while `active` — for cooking, where your hands are
 * covered in flour and the phone locking itself every 30 seconds is the whole
 * problem with reading a recipe off a screen.
 *
 * Progressive enhancement in both directions. Safari on iOS only shipped the
 * Wake Lock API in 16.4, and a request can be refused outright (low battery,
 * background tab), so every path here fails quietly and leaves you with a
 * screen that dims — annoying, not broken.
 *
 * The re-acquire on visibilitychange isn't optional: browsers drop the lock
 * whenever the page is hidden and never hand it back, so without this,
 * glancing at a timer and coming back leaves the lock silently dead.
 */
export function useWakeLock(active: boolean) {
  const sentinel = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || sentinel.current) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel.current = lock;
        lock.addEventListener('release', () => {
          sentinel.current = null;
        });
      } catch {
        // Refused (battery saver, no user gesture, unsupported). Not fatal.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const lock = sentinel.current;
      sentinel.current = null;
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
