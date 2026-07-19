import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, isRateLimited, requestIdentity } from '../src/lib/rate-limit.ts';

test('isRateLimited allows up to the limit, then blocks', () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    assert.equal(isRateLimited(key, 3), false);
  }
  assert.equal(isRateLimited(key, 3), true);
});

test('isRateLimited tracks separate keys independently', () => {
  const a = `a-${Math.random()}`;
  const b = `b-${Math.random()}`;
  isRateLimited(a, 1);
  assert.equal(isRateLimited(a, 1), true);
  assert.equal(isRateLimited(b, 1), false);
});

test('clientIp reads the first address from x-forwarded-for', () => {
  const req = new Request('http://localhost', {
    headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
  });
  assert.equal(clientIp(req), '1.2.3.4');
});

test('clientIp falls back to "local" when the header is absent', () => {
  const req = new Request('http://localhost');
  assert.equal(clientIp(req), 'local');
});

test('requestIdentity falls back to an ip-prefixed identity outside a signed-in session', async () => {
  // No Next.js request context and no Supabase project configured in this
  // test environment — both signed-out and "accounts not set up" should
  // land on the same safe IP fallback, never throw.
  const req = new Request('http://localhost', {
    headers: { 'x-forwarded-for': '9.8.7.6' },
  });
  const identity = await requestIdentity(req);
  assert.equal(identity, 'ip:9.8.7.6');
});
