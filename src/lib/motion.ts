/**
 * Shared motion tokens — the single source of truth for how things animate
 * across the app. Before this, every component picked its own entrance
 * offset (6 / 8 / 10px), its own duration, and often *omitted* the
 * transition entirely; framer-motion then animated `opacity` as a tween but
 * `y` as a spring on different curves, so the two desynced and entrances
 * looked jumpy and inconsistent from page to page. Routing everything
 * through these tokens keeps every fade, rise, reflow, and collapse on the
 * same timing.
 *
 * All of these feed framer-motion, which honors the `reducedMotion="user"`
 * MotionConfig in AppProviders, so prefers-reduced-motion needs no extra
 * handling here.
 */
import type { TargetAndTransition, Transition, Variants } from 'framer-motion';

/** One ease-out curve (easeOutQuint-ish) for every entrance/exit tween. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** One entrance/exit duration, in seconds. */
export const DURATION = 0.28;

/** Vertical offset for the standard fade-and-rise entrance, in px. */
const RISE = 8;

/**
 * Default tween for entrance/exit opacity + transform, so the two always
 * finish together (leaving this implicit is the main source of the jumpy
 * feel). When a component also uses `layout`, merge in the spring:
 * `transition={{ ...enter, layout: layoutSpring }}`.
 */
export const enter: Transition = { duration: DURATION, ease: EASE };

/** One spring for every layout reflow (card reorders, list relocations). */
export const layoutSpring: Transition = { type: 'spring', stiffness: 400, damping: 35 };

/** Fade + rise in — the shared entrance for list items, sections, and cards. */
export const fadeRise: Variants = {
  initial: { opacity: 0, y: RISE },
  animate: { opacity: 1, y: 0 },
};

/**
 * Exit for reorderable list rows: collapse height so neighbors close the
 * gap smoothly instead of the row vanishing and leaving a hole.
 */
export const listRowExit: TargetAndTransition = { opacity: 0, height: 0, marginBottom: 0 };

/**
 * Exit for grid cards: fade + slight shrink. In a grid, collapsing height
 * would look wrong, so cards recede in place while siblings reflow.
 */
export const cardExit: TargetAndTransition = { opacity: 0, scale: 0.97 };

/** Collapse a block's height while fading — for expand/collapse panels. */
export const collapse: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
};
