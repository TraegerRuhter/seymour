import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLastWriteWins, userChangedDuring, withRetries } from '../src/lib/sync.ts';
import { useAuthUserStore } from '../src/lib/stores.ts';

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

test('userChangedDuring: false when the signed-in user is still the same', () => {
  useAuthUserStore.setState({ userId: 'alice' });
  assert.equal(userChangedDuring('alice'), false);
});

test('userChangedDuring: true after signing out mid-pull', () => {
  useAuthUserStore.setState({ userId: 'alice' });
  useAuthUserStore.setState({ userId: null });
  assert.equal(userChangedDuring('alice'), true);
});

test('userChangedDuring: true after switching to a different account mid-pull', () => {
  useAuthUserStore.setState({ userId: 'alice' });
  useAuthUserStore.setState({ userId: 'bob' });
  assert.equal(userChangedDuring('alice'), true);
});

test('withRetries: returns immediately on the first success, without retrying', async () => {
  let calls = 0;
  const result = await withRetries(async () => {
    calls++;
    return { error: null, data: 'ok' };
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { error: null, data: 'ok' });
});

test('withRetries: retries on error and returns the eventual success', async () => {
  let calls = 0;
  const result = await withRetries(
    async () => {
      calls++;
      if (calls < 3) return { error: 'boom', data: null };
      return { error: null, data: 'ok' };
    },
    3,
    1,
  );
  assert.equal(calls, 3);
  assert.deepEqual(result, { error: null, data: 'ok' });
});

test('withRetries: gives up after the attempt cap and returns the last failure', async () => {
  let calls = 0;
  const result = await withRetries(
    async () => {
      calls++;
      return { error: 'still broken', data: null };
    },
    3,
    1,
  );
  assert.equal(calls, 3);
  assert.deepEqual(result, { error: 'still broken', data: null });
});
