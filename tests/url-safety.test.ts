import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPublicHostname,
  isPrivateOrReservedIp,
  UnsafeUrlError,
} from '../src/lib/url-safety.ts';

test('isPrivateOrReservedIp flags private, loopback, link-local, and reserved IPv4 ranges', () => {
  const unsafe = [
    '10.0.0.1',
    '172.16.5.4',
    '172.31.255.255',
    '192.168.1.1',
    '127.0.0.1',
    '169.254.169.254', // cloud metadata endpoint
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
  ];
  for (const ip of unsafe) assert.equal(isPrivateOrReservedIp(ip), true, ip);
});

test('isPrivateOrReservedIp allows ordinary public IPv4 addresses', () => {
  const safe = ['8.8.8.8', '93.184.216.34', '172.15.0.1', '172.32.0.1', '1.1.1.1'];
  for (const ip of safe) assert.equal(isPrivateOrReservedIp(ip), false, ip);
});

test('isPrivateOrReservedIp flags loopback, link-local, and unique-local IPv6', () => {
  const unsafe = ['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1'];
  for (const ip of unsafe) assert.equal(isPrivateOrReservedIp(ip), true, ip);
});

test('isPrivateOrReservedIp allows a public IPv6 address', () => {
  assert.equal(isPrivateOrReservedIp('2606:4700:4700::1111'), false);
});

test('isPrivateOrReservedIp treats an unparseable value as unsafe', () => {
  assert.equal(isPrivateOrReservedIp('not-an-ip'), true);
});

test('assertPublicHostname rejects "localhost" without doing a lookup', async () => {
  let called = false;
  await assert.rejects(
    () =>
      assertPublicHostname('localhost', async () => {
        called = true;
        return [{ address: '8.8.8.8' }];
      }),
    UnsafeUrlError,
  );
  assert.equal(called, false);
});

test('assertPublicHostname rejects a literal private IP without doing a lookup', async () => {
  let called = false;
  await assert.rejects(
    () =>
      assertPublicHostname('169.254.169.254', async () => {
        called = true;
        return [{ address: '8.8.8.8' }];
      }),
    UnsafeUrlError,
  );
  assert.equal(called, false);
});

test('assertPublicHostname rejects a hostname that resolves to a private address', async () => {
  await assert.rejects(
    () => assertPublicHostname('internal.example.com', async () => [{ address: '10.0.0.5' }]),
    UnsafeUrlError,
  );
});

test('assertPublicHostname rejects a hostname with any private address among several', async () => {
  await assert.rejects(
    () =>
      assertPublicHostname('example.com', async () => [
        { address: '93.184.216.34' },
        { address: '127.0.0.1' },
      ]),
    UnsafeUrlError,
  );
});

test('assertPublicHostname resolves cleanly for a hostname with only public addresses', async () => {
  await assertPublicHostname('example.com', async () => [{ address: '93.184.216.34' }]);
});

test('assertPublicHostname rejects when the lookup fails', async () => {
  await assert.rejects(
    () =>
      assertPublicHostname('nonexistent.invalid', async () => {
        throw new Error('ENOTFOUND');
      }),
    UnsafeUrlError,
  );
});

test('assertPublicHostname rejects when the lookup returns no addresses', async () => {
  await assert.rejects(() => assertPublicHostname('example.com', async () => []), UnsafeUrlError);
});
