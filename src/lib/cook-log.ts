import type { Recipe } from './types';

/**
 * The cook log: a record of when a recipe was actually made, as opposed to
 * merely saved or planned.
 *
 * This is the app's only *event* — everything else it stores is intent (a
 * plan) or inventory (a recipe). Events are what let the app accumulate: they
 * are what "you've made this 12 times", visible wear on a recipe card, and
 * "you haven't cooked this since March" are all derived from.
 *
 * Deliberately dependency-free and synchronous. None of this needs a model or
 * a network call — it's arithmetic over the user's own history.
 */

/** How worn a recipe card should look, derived purely from how often it's been made. */
export type WearLevel = 'pristine' | 'light' | 'worn' | 'loved';

export function cookCount(recipe: Pick<Recipe, 'cookedAt'>): number {
  return recipe.cookedAt?.length ?? 0;
}

/** Most recent cook as an ISO string, or undefined if it's never been made. */
export function lastCookedAt(recipe: Pick<Recipe, 'cookedAt'>): string | undefined {
  const log = recipe.cookedAt;
  if (!log || log.length === 0) return undefined;
  // The log is kept sorted ascending by every writer below, so the last entry
  // is the most recent — but don't assume it for data that predates that.
  return log.reduce((latest, entry) => (entry > latest ? entry : latest));
}

/**
 * Maps a cook count onto a wear tier. The thresholds are judgement calls, not
 * science: the point is that the jumps are far enough apart that a card
 * visibly changes a handful of times over its life rather than creeping.
 */
export function wearLevel(count: number): WearLevel {
  if (count <= 0) return 'pristine';
  if (count <= 3) return 'light';
  if (count <= 12) return 'worn';
  return 'loved';
}

/**
 * Unions two cook logs, deduped and sorted ascending.
 *
 * Cook events are append-only facts, so the usual last-write-wins rule is
 * wrong for them: if two devices each record a dinner while offline, LWW
 * silently discards one of them. A union keeps both, which is what actually
 * happened. (The tradeoff: undoing a mis-tap on one device can be resurrected
 * by another device that still holds the entry. Acceptable for a personal
 * app, and far less bad than losing real history.)
 */
export function mergeCookLogs(a?: string[], b?: string[]): string[] {
  if (!a?.length) return [...(b ?? [])].sort();
  if (!b?.length) return [...a].sort();
  return [...new Set([...a, ...b])].sort();
}

/** Appends a cook event, keeping the log sorted and free of exact duplicates. */
export function appendCook(log: string[] | undefined, at: string): string[] {
  return mergeCookLogs(log, [at]);
}

/** Removes the most recent cook event — the undo for a mis-tap. */
export function removeLastCook(log: string[] | undefined): string[] {
  if (!log?.length) return [];
  const sorted = [...log].sort();
  sorted.pop();
  return sorted;
}

const DAY_MS = 86_400_000;

/**
 * A short, human phrase for when something was last made — the kind of thing
 * you'd actually say out loud ("Tuesday", "3 weeks ago"), not a timestamp.
 * `now` is injectable so this is testable without freezing the clock.
 */
export function describeLastCooked(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return 'Never made';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'Never made';

  // Compare calendar days, not elapsed milliseconds, so something cooked at
  // 11pm still reads as "Yesterday" at 8am rather than "Today".
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);

  if (days < 0) return 'Just now';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return then.toLocaleDateString(undefined, { month: 'long' });
  return then.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** "23 ×" / "Never made" — the tally shown on a card's footer. */
export function describeCookCount(count: number): string {
  if (count <= 0) return 'Never made';
  return `${count} ×`;
}

/**
 * Picks one of four mark placements from the recipe id, so two equally-worn
 * recipes don't carry identical stains. Deterministic: the same recipe always
 * wears the same way, rather than reshuffling on every render.
 *
 * Lives here rather than in a component because two surfaces read it — the
 * card in the library and the opened sheet on the detail page — and a recipe
 * that stains differently depending on which one you're looking at would give
 * the whole conceit away.
 */
export function markVariant(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 100000;
  return hash % 4;
}
