import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLastWriteWins } from '../src/lib/sync.ts';

interface Item {
  id: string;
  updatedAt?: string;
}

test('resolveLastWriteWins: both undefined returns undefined', () => {
  assert.equal(resolveLastWriteWins<Item>(undefined, undefined), undefined);
});

test('resolveLastWriteWins: only remote exists, remote wins', () => {
  const remote: Item = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(resolveLastWriteWins(undefined, remote), remote);
});

test('resolveLastWriteWins: only local exists, local wins', () => {
  const local: Item = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(resolveLastWriteWins(local, undefined), local);
});

test('resolveLastWriteWins: remote is strictly newer, remote wins', () => {
  const local: Item = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' };
  const remote: Item = { id: 'a', updatedAt: '2026-01-02T00:00:00.000Z' };
  assert.equal(resolveLastWriteWins(local, remote), remote);
});

test('resolveLastWriteWins: local is strictly newer, local wins', () => {
  const local: Item = { id: 'a', updatedAt: '2026-01-05T00:00:00.000Z' };
  const remote: Item = { id: 'a', updatedAt: '2026-01-02T00:00:00.000Z' };
  assert.equal(resolveLastWriteWins(local, remote), local);
});

test('resolveLastWriteWins: identical timestamps favor local (no churn)', () => {
  const local: Item = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' };
  const remote: Item = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(resolveLastWriteWins(local, remote), local);
});

test('resolveLastWriteWins: both missing updatedAt favors local', () => {
  const local: Item = { id: 'a' };
  const remote: Item = { id: 'a' };
  assert.equal(resolveLastWriteWins(local, remote), local);
});
