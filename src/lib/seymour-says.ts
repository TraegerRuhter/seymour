import type { Recipe } from './types';
import { toLocalDateString } from './plan';
import { cookCount, lastCookedAt } from './cook-log';

/**
 * What Seymour has to say about your cooking.
 *
 * Rules over your own history — no model, no network, no randomness. Every
 * line is earned by something that actually happened, which is the whole
 * point: an observation you can verify beats a generated pleasantry.
 *
 * VOICE. Seymour is a man-eating plant who has been told to wait his turn.
 * Dry, observant, a little needy, fond of you. He notices things and mentions
 * them. He does not cheer, exclaim, congratulate, or use exclamation marks,
 * and he never nags about anything you can't act on.
 *
 * THE CLIPPY RULE. Returning nothing is a valid and common outcome. Silence
 * is better than filler, so a line only appears when there's something real
 * to say. Rules are ordered most-interesting first and the first match wins,
 * so Seymour makes one remark rather than a list of them.
 */

export interface SeymourLine {
  text: string;
  /** Which rule fired. Kept so tests can assert intent rather than copy. */
  rule: string;
}

export interface SeymourInput {
  recipes: Recipe[];
  now?: Date;
}

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function daysBetween(iso: string, now: Date): number {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);
}

/** Every distinct local calendar day on which anything at all was cooked. */
function cookDays(recipes: Recipe[]): Set<string> {
  const days = new Set<string>();
  for (const recipe of recipes) {
    for (const iso of recipe.cookedAt ?? []) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) days.add(toLocalDateString(d));
    }
  }
  return days;
}

/**
 * Consecutive days cooked, counting back from today. A streak only counts as
 * *current* if it reaches today or yesterday — otherwise "5 days running" is
 * a claim about last month, which would read as a lie.
 */
export function currentStreak(recipes: Recipe[], now: Date): number {
  const days = cookDays(recipes);
  if (days.size === 0) return 0;

  const dayBefore = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  let cursor = new Date(now);
  if (!days.has(toLocalDateString(cursor))) {
    cursor = dayBefore(cursor);
    if (!days.has(toLocalDateString(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(toLocalDateString(cursor))) {
    streak++;
    cursor = dayBefore(cursor);
  }
  return streak;
}

const MILESTONES = [10, 25, 50, 100, 250, 500];

/**
 * Picks the one thing worth remarking on, or nothing.
 *
 * Ordering is the design: the rules run most-surprising first, so a milestone
 * beats a routine "cooked today", and a long silence beats both.
 */
export function seymourSays({ recipes, now = new Date() }: SeymourInput): SeymourLine | undefined {
  const saved = recipes.length;

  // Nothing to work with at all.
  if (saved === 0) {
    return { rule: 'empty-box', text: 'The box is empty. Feed me something.' };
  }

  const totalCooks = recipes.reduce((sum, r) => sum + cookCount(r), 0);
  const cooked = recipes.filter((r) => cookCount(r) > 0);

  // A collection with no cooking behind it yet.
  if (totalCooks === 0) {
    return {
      rule: 'never-cooked',
      text:
        saved >= 5
          ? `${saved} recipes in the box and not one of them cooked. I notice these things.`
          : 'Saved, but not cooked. I can wait. I am very good at waiting.',
    };
  }

  const lastAnyIso = cooked
    .map((r) => lastCookedAt(r))
    .filter((iso): iso is string => !!iso)
    .sort()
    .at(-1)!;
  const silentDays = daysBetween(lastAnyIso, now);

  // A real gap. Worth saying once it's long enough to be true.
  if (silentDays >= 10) {
    return {
      rule: 'long-silence',
      text: `Nothing cooked in ${silentDays} days. I'm withering over here.`,
    };
  }

  // A milestone, but only on the day it was actually reached — otherwise it
  // would sit there congratulating you for a fortnight.
  if (MILESTONES.includes(totalCooks) && daysBetween(lastAnyIso, now) === 0) {
    return { rule: 'milestone', text: `That's ${totalCooks} meals cooked. Somebody's been busy.` };
  }

  const streak = currentStreak(recipes, now);
  if (streak >= 3) {
    return { rule: 'streak', text: `${streak} days running. Look at you.` };
  }

  // The same thing, repeatedly, lately.
  const recentRepeat = cooked
    .map((r) => ({
      recipe: r,
      count: (r.cookedAt ?? []).filter((iso) => daysBetween(iso, now) <= 14).length,
    }))
    .filter((x) => x.count >= 3)
    .sort((a, b) => b.count - a.count)[0];
  if (recentRepeat) {
    return {
      rule: 'on-repeat',
      text: `That's ${recentRepeat.count} helpings of ${recentRepeat.recipe.title} in a fortnight. Not that I'm judging.`,
    };
  }

  // Something you clearly liked and then forgot about.
  const neglected = cooked
    .filter((r) => {
      const iso = lastCookedAt(r);
      return cookCount(r) >= 5 && iso && daysBetween(iso, now) >= 60;
    })
    .sort((a, b) => cookCount(b) - cookCount(a))[0];
  if (neglected) {
    const when = new Date(lastCookedAt(neglected)!).toLocaleDateString(undefined, {
      month: 'long',
    });
    return {
      rule: 'neglected-favourite',
      text: `You've made ${neglected.title} ${cookCount(neglected)} times, but not since ${when}. It's right there.`,
    };
  }

  // A big collection you're barely touching.
  if (saved >= 12 && cooked.length * 4 <= saved) {
    return {
      rule: 'unread-shelf',
      text: `${saved} recipes in the box. You've made ${cooked.length} of them.`,
    };
  }

  // Nothing remarkable — say nothing. This is the common case, and it should
  // stay that way; a line every single visit stops being worth reading.
  if (silentDays === 0) {
    const today = cooked.filter((r) => {
      const iso = lastCookedAt(r);
      return iso && daysBetween(iso, now) === 0;
    });
    if (today.length >= 2) {
      return { rule: 'busy-day', text: `${today.length} things cooked today. Ambitious.` };
    }
    if (today.length === 1) {
      return { rule: 'cooked-today', text: `${today[0].title} today. Good.` };
    }
  }

  return undefined;
}
