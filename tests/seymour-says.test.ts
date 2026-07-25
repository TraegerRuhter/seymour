import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak, seymourSays } from '../src/lib/seymour-says.ts';
import type { Recipe } from '../src/lib/types.ts';

const NOW = new Date(2026, 6, 20, 12, 0); // 20 Jul 2026, midday local

/** A local-midday ISO timestamp `n` days before NOW. */
function daysAgo(n: number): string {
  return new Date(2026, 6, 20 - n, 12, 0).toISOString();
}

function recipe(title: string, cookedAt: string[] = []): Recipe {
  return {
    id: title.toLowerCase().replace(/\s+/g, '-'),
    title,
    sourceUrl: '',
    ingredients: [],
    instructions: [],
    dateAdded: daysAgo(200),
    ...(cookedAt.length ? { cookedAt: [...cookedAt].sort() } : {}),
  };
}

// Tests assert on `rule` rather than exact copy, so the wording can be
// rewritten without rewriting the suite.
const ruleFor = (recipes: Recipe[]) => seymourSays({ recipes, now: NOW })?.rule;

test('an empty collection asks to be fed', () => {
  assert.equal(ruleFor([]), 'empty-box');
});

test('a saved-but-never-cooked collection is noticed', () => {
  assert.equal(ruleFor([recipe('Toast')]), 'never-cooked');
  const many = Array.from({ length: 6 }, (_, i) => recipe(`Recipe ${i}`));
  assert.equal(ruleFor(many), 'never-cooked');
});

test('a long silence outranks everything else', () => {
  // Also has a milestone-shaped count, but the gap is the more honest remark.
  const r = recipe(
    'Chili',
    Array.from({ length: 10 }, (_, i) => daysAgo(30 + i)),
  );
  assert.equal(ruleFor([r]), 'long-silence');
});

test('a silence shorter than the threshold says nothing about withering', () => {
  const r = recipe('Chili', [daysAgo(6)]);
  assert.notEqual(ruleFor([r]), 'long-silence');
});

test('a milestone only fires on the day it is actually reached', () => {
  const onTheDay = recipe('Curry', [
    ...Array.from({ length: 9 }, (_, i) => daysAgo(i + 1)),
    daysAgo(0),
  ]);
  assert.equal(seymourSays({ recipes: [onTheDay], now: NOW })?.rule, 'milestone');

  // Same total, but reached a few days ago — it shouldn't still be talking
  // about it. (Two days ago, so the streak rule doesn't pick it up either.)
  const stale = recipe(
    'Curry',
    Array.from({ length: 10 }, (_, i) => daysAgo(i + 2)),
  );
  assert.notEqual(seymourSays({ recipes: [stale], now: NOW })?.rule, 'milestone');
});

test('a current streak is reported', () => {
  const r = recipe('Eggs', [daysAgo(0), daysAgo(1), daysAgo(2)]);
  assert.equal(ruleFor([r]), 'streak');
});

test('currentStreak counts back from today or yesterday, and stops at a gap', () => {
  assert.equal(currentStreak([recipe('a', [daysAgo(0), daysAgo(1), daysAgo(2)])], NOW), 3);
  // Starting yesterday still counts as current.
  assert.equal(currentStreak([recipe('a', [daysAgo(1), daysAgo(2)])], NOW), 2);
  // A gap ends it.
  assert.equal(currentStreak([recipe('a', [daysAgo(0), daysAgo(2), daysAgo(3)])], NOW), 1);
  // A streak that ended a while ago is not "current" and must not be claimed.
  assert.equal(currentStreak([recipe('a', [daysAgo(8), daysAgo(9), daysAgo(10)])], NOW), 0);
  assert.equal(currentStreak([], NOW), 0);
});

test('a streak spans recipes — it is about days cooked, not one dish', () => {
  const a = recipe('Eggs', [daysAgo(0)]);
  const b = recipe('Soup', [daysAgo(1)]);
  const c = recipe('Tacos', [daysAgo(2)]);
  assert.equal(currentStreak([a, b, c], NOW), 3);
});

test('cooking the same thing repeatedly lately gets a comment', () => {
  // Spread over a fortnight with gaps, so it is not also a streak.
  const r = recipe('Pancakes', [daysAgo(1), daysAgo(5), daysAgo(9)]);
  assert.equal(ruleFor([r]), 'on-repeat');
});

test('a long-loved recipe gone quiet is resurfaced', () => {
  const r = recipe(
    'Chicken Curry',
    Array.from({ length: 6 }, (_, i) => daysAgo(90 + i)),
  );
  const recent = recipe('Toast', [daysAgo(1)]);
  assert.equal(ruleFor([r, recent]), 'neglected-favourite');
});

test('a large collection that is barely cooked from is pointed out', () => {
  const shelf = Array.from({ length: 15 }, (_, i) => recipe(`Saved ${i}`));
  shelf[0] = recipe('Saved 0', [daysAgo(1)]);
  assert.equal(ruleFor(shelf), 'unread-shelf');
});

test('cooking today is acknowledged plainly', () => {
  assert.equal(ruleFor([recipe('Risotto', [daysAgo(0)])]), 'cooked-today');
});

test('several things cooked today reads as a busy day', () => {
  const a = recipe('Risotto', [daysAgo(0)]);
  const b = recipe('Focaccia', [daysAgo(0)]);
  assert.equal(ruleFor([a, b]), 'busy-day');
});

test('an ordinary week with nothing remarkable says nothing at all', () => {
  // Cooked a few days back, no streak, no repeats, no milestone, small
  // collection. Seymour should keep quiet rather than manufacture a line.
  const recipes = [recipe('Soup', [daysAgo(3)]), recipe('Salad', [daysAgo(5)])];
  assert.equal(seymourSays({ recipes, now: NOW }), undefined);
});

test('a malformed timestamp never crashes the dashboard', () => {
  const r = recipe('Broken', ['not-a-date']);
  assert.doesNotThrow(() => seymourSays({ recipes: [r], now: NOW }));
});
