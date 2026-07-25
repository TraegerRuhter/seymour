import type { MealType } from './types';

/**
 * What time it is, in meals.
 *
 * The app has always known the date and shown today's plan starting at
 * breakfast, which is the right answer for about two hours a day. At 5pm the
 * thing you want is dinner, and it was third in a row of four.
 *
 * Everything here is local time and pure — no storage, no network — so the
 * dashboard can call it during render and the tests can pin `now`.
 */

/**
 * When each meal slot opens, in minutes past local midnight.
 *
 * Ordered chronologically rather than by the app's usual meal-type order,
 * which lists snack and dessert last. A snack is genuinely any-time food, but
 * it has to sit *somewhere* for "what's next" to mean anything, and
 * mid-afternoon is where it lands most often.
 *
 * There is no slot before breakfast: 1am belongs to the night that hasn't
 * finished yet, so anything earlier than 4am falls back to the last slot of
 * the previous day rather than rushing you towards breakfast.
 */
const SLOTS: ReadonlyArray<{ opensAt: number; meal: MealType }> = [
  { opensAt: 4 * 60, meal: 'breakfast' },
  { opensAt: 11 * 60, meal: 'lunch' },
  { opensAt: 15 * 60, meal: 'snack' },
  { opensAt: 17 * 60 + 30, meal: 'dinner' },
  { opensAt: 21 * 60, meal: 'dessert' },
];

const RANK = new Map<MealType, number>(SLOTS.map((s, i) => [s.meal, i]));

/** The meal slot a given moment sits in. */
export function mealSlotAt(now: Date): MealType {
  const minutes = now.getHours() * 60 + now.getMinutes();
  let current = SLOTS[SLOTS.length - 1].meal; // pre-dawn: still last night
  for (const slot of SLOTS) {
    if (minutes >= slot.opensAt) current = slot.meal;
  }
  return current;
}

/**
 * Today's meals, rotated so the one you're heading for comes first.
 *
 * Rotated rather than filtered: the meals you've already had stay reachable,
 * they just stop being the first thing you see. A plan that skips the current
 * slot entirely (no snack on a Tuesday afternoon) leads with whatever comes
 * next instead, wrapping back to the start of the day if nothing does.
 */
export function orderFromNow<T extends { type: MealType }>(meals: T[], now: Date): T[] {
  if (meals.length === 0) return meals;
  const byTime = [...meals].sort((a, b) => (RANK.get(a.type) ?? 0) - (RANK.get(b.type) ?? 0));
  const nowRank = RANK.get(mealSlotAt(now)) ?? 0;
  const pivot = byTime.findIndex((m) => (RANK.get(m.type) ?? 0) >= nowRank);
  if (pivot <= 0) return byTime;
  return [...byTime.slice(pivot), ...byTime.slice(0, pivot)];
}

/**
 * Whether the meal now leading the list is the one happening *now* or the one
 * coming *next* — or neither, when every meal today is already behind you and
 * the list has wrapped around to tomorrow morning's.
 *
 * The distinction matters because labelling dinner "now" at 3pm is a small
 * lie, and the whole value of a line like this is that it's checkable.
 */
export function leadTiming(lead: MealType | undefined, now: Date): 'now' | 'next' | undefined {
  if (!lead) return undefined;
  const nowRank = RANK.get(mealSlotAt(now)) ?? 0;
  const leadRank = RANK.get(lead) ?? 0;
  if (leadRank === nowRank) return 'now';
  return leadRank > nowRank ? 'next' : undefined;
}
