import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growthName, growthStage, justGrewInto } from '../src/lib/growth.ts';
import { seymourSays } from '../src/lib/seymour-says.ts';

test('an untouched collection leaves him a seed', () => {
  assert.equal(growthStage(0), 0);
  assert.equal(growthName(0), 'A seedling');
});

test('the very first cook moves him, so the mechanic announces itself', () => {
  assert.equal(growthStage(1), 1);
  assert.notEqual(growthStage(1), growthStage(0));
});

test('each threshold starts its stage and holds it until the next', () => {
  assert.equal(growthStage(4), 1);
  assert.equal(growthStage(5), 2);
  assert.equal(growthStage(19), 2);
  assert.equal(growthStage(20), 3);
  assert.equal(growthStage(49), 3);
  assert.equal(growthStage(50), 4);
});

test('he does not keep growing forever', () => {
  assert.equal(growthStage(500), 4);
  assert.equal(growthStage(100000), 4);
});

test('a nonsense count still resolves to a stage rather than blowing up', () => {
  // Defensive: a corrupt or absent log should render a seed, not nothing.
  assert.equal(growthStage(-3), 0);
});

test('every stage has a name', () => {
  for (const stage of [0, 1, 2, 3, 4] as const) {
    assert.ok(growthName(stage).length > 0);
  }
});

test('only the exact threshold counts as having just grown', () => {
  assert.equal(justGrewInto(1), 1);
  assert.equal(justGrewInto(5), 2);
  assert.equal(justGrewInto(20), 3);
  assert.equal(justGrewInto(50), 4);

  assert.equal(justGrewInto(2), undefined);
  assert.equal(justGrewInto(19), undefined);
  assert.equal(justGrewInto(51), undefined);
});

test('starting at zero is not an event to announce', () => {
  assert.equal(justGrewInto(0), undefined);
});

test('growing is announced on the day it happens, and not after', () => {
  const cookedToday = (times: number) => [
    {
      id: 'r',
      title: 'Curry',
      ingredients: [],
      instructions: [],
      dateAdded: '2026-07-01T00:00:00.000Z',
      cookedAt: Array.from({ length: times }, () => '2026-07-25T18:00:00.000Z'),
    },
  ];
  const now = new Date('2026-07-25T20:00:00.000Z');

  // The fifth cook crosses into "Growing".
  assert.equal(seymourSays({ recipes: cookedToday(5) as never, now })?.rule, 'just-grown');
  // The sixth does not.
  assert.notEqual(seymourSays({ recipes: cookedToday(6) as never, now })?.rule, 'just-grown');
});

test('the first cook keeps its own warmer line rather than announcing growth', () => {
  const oneCookToday = [
    {
      id: 'r',
      title: 'Lentil & Kale Soup',
      ingredients: [],
      instructions: [],
      dateAdded: '2026-07-01T00:00:00.000Z',
      cookedAt: ['2026-07-25T18:00:00.000Z'],
    },
  ];
  const line = seymourSays({
    recipes: oneCookToday as never,
    now: new Date('2026-07-25T20:00:00.000Z'),
  });
  assert.equal(line?.rule, 'cooked-today');
});
