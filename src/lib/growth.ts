/**
 * How big Seymour has got.
 *
 * Driven by how many meals you've actually cooked, not by how many recipes
 * you've saved. The prospectus offered either (§6.4), and cooking is the
 * honest one: a collection measures hoarding, a cook log measures feeding, and
 * feeding is the entire thing he asks for. Saving forty recipes you never make
 * should not grow him — that's the "unread shelf" he already complains about.
 *
 * Deliberately not a progress bar. There is no "2 more to the next stage"
 * anywhere in the app, and there shouldn't be: the moment a character's growth
 * comes with a meter, it stops being something you notice and becomes
 * something you're being asked to farm.
 */

/** 0 is a seed in a pot; 4 is a plant with opinions. */
export type GrowthStage = 0 | 1 | 2 | 3 | 4;

/**
 * The cook count at which each stage begins.
 *
 * Front-loaded on purpose. The first cook has to change something visible or
 * the mechanic never announces itself, and the gap widens after that so the
 * later stages stay rare enough to mean something.
 */
const THRESHOLDS: readonly number[] = [0, 1, 5, 20, 50];

/** What to call each stage. Descriptive, not congratulatory. */
const NAMES: readonly string[] = ['A seedling', 'A sprout', 'Growing', 'Thriving', 'Enormous'];

export function growthStage(totalCooks: number): GrowthStage {
  let stage = 0;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (totalCooks >= THRESHOLDS[i]) stage = i;
  }
  return stage as GrowthStage;
}

export function growthName(stage: GrowthStage): string {
  return NAMES[stage];
}

/**
 * True when this exact cook count is the one that started a new stage.
 *
 * Used to let Seymour mention it on the day it happens and never again —
 * the same trick the milestone rule uses. A stage change the user can't see a
 * reason for is just the UI shifting under them.
 */
export function justGrewInto(totalCooks: number): GrowthStage | undefined {
  const index = THRESHOLDS.indexOf(totalCooks);
  // Stage 0 is where everyone starts, so "growing into" it is not an event.
  return index > 0 ? (index as GrowthStage) : undefined;
}
