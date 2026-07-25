import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCook,
  cookCount,
  describeCookCount,
  describeLastCooked,
  lastCookedAt,
  mergeCookLogs,
  removeLastCook,
  wearLevel,
} from '../src/lib/cook-log.ts';

test('a recipe with no log reads as never made', () => {
  assert.equal(cookCount({}), 0);
  assert.equal(lastCookedAt({}), undefined);
  assert.equal(describeCookCount(0), 'Never made');
  assert.equal(describeLastCooked(undefined), 'Never made');
});

test('lastCookedAt returns the latest entry even if the log is out of order', () => {
  const cookedAt = [
    '2026-03-01T18:00:00.000Z',
    '2026-07-01T18:00:00.000Z',
    '2026-05-01T18:00:00.000Z',
  ];
  assert.equal(lastCookedAt({ cookedAt }), '2026-07-01T18:00:00.000Z');
});

test('appendCook keeps the log sorted and deduped', () => {
  let log = appendCook(undefined, '2026-05-01T18:00:00.000Z');
  log = appendCook(log, '2026-03-01T18:00:00.000Z');
  log = appendCook(log, '2026-05-01T18:00:00.000Z'); // exact duplicate
  assert.deepEqual(log, ['2026-03-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z']);
});

test('removeLastCook drops only the most recent entry', () => {
  const log = ['2026-03-01T18:00:00.000Z', '2026-05-01T18:00:00.000Z'];
  assert.deepEqual(removeLastCook(log), ['2026-03-01T18:00:00.000Z']);
  assert.deepEqual(removeLastCook(['2026-03-01T18:00:00.000Z']), []);
  assert.deepEqual(removeLastCook(undefined), []);
});

test('mergeCookLogs unions both sides rather than picking a winner', () => {
  // The whole point: two devices each recorded a dinner while offline.
  const phone = ['2026-05-01T18:00:00.000Z', '2026-05-03T18:00:00.000Z'];
  const laptop = ['2026-05-01T18:00:00.000Z', '2026-05-04T18:00:00.000Z'];
  assert.deepEqual(mergeCookLogs(phone, laptop), [
    '2026-05-01T18:00:00.000Z',
    '2026-05-03T18:00:00.000Z',
    '2026-05-04T18:00:00.000Z',
  ]);
});

test('mergeCookLogs handles an empty or missing side', () => {
  const log = ['2026-05-01T18:00:00.000Z'];
  assert.deepEqual(mergeCookLogs(log, undefined), log);
  assert.deepEqual(mergeCookLogs(undefined, log), log);
  assert.deepEqual(mergeCookLogs(undefined, undefined), []);
  assert.deepEqual(mergeCookLogs([], log), log);
});

test('wearLevel steps through tiers rather than creeping', () => {
  assert.equal(wearLevel(0), 'pristine');
  assert.equal(wearLevel(1), 'light');
  assert.equal(wearLevel(3), 'light');
  assert.equal(wearLevel(4), 'worn');
  assert.equal(wearLevel(12), 'worn');
  assert.equal(wearLevel(13), 'loved');
  assert.equal(wearLevel(200), 'loved');
});

test('wearLevel treats a negative or nonsense count as pristine', () => {
  assert.equal(wearLevel(-5), 'pristine');
});

test('describeCookCount reads as a tally', () => {
  assert.equal(describeCookCount(1), '1 ×');
  assert.equal(describeCookCount(23), '23 ×');
});

test('describeLastCooked speaks in calendar days, not elapsed hours', () => {
  const now = new Date(2026, 6, 20, 8, 0); // 20 Jul 2026, 8am local
  // Cooked at 11pm the previous night — elapsed time is only 9 hours, but
  // the honest phrasing is "Yesterday", not "Today".
  assert.equal(describeLastCooked(new Date(2026, 6, 19, 23, 0).toISOString(), now), 'Yesterday');
  assert.equal(describeLastCooked(new Date(2026, 6, 20, 1, 0).toISOString(), now), 'Today');
});

test('describeLastCooked scales its phrasing with distance', () => {
  const now = new Date(2026, 6, 20, 12, 0);
  const daysAgo = (n: number) => new Date(2026, 6, 20 - n, 12, 0).toISOString();
  assert.equal(describeLastCooked(daysAgo(3), now), '3 days ago');
  assert.equal(describeLastCooked(daysAgo(9), now), 'Last week');
  assert.equal(describeLastCooked(daysAgo(21), now), '3 weeks ago');
  // Beyond two months it names the month instead of counting weeks.
  assert.match(describeLastCooked(daysAgo(120), now), /^[A-Z][a-z]+$/);
  // Beyond a year it disambiguates with the year.
  assert.match(describeLastCooked(daysAgo(500), now), /\d{4}/);
});

test('describeLastCooked tolerates a malformed timestamp', () => {
  assert.equal(describeLastCooked('not-a-date'), 'Never made');
});
