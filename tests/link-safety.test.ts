import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHttpUrl } from '../src/lib/link-safety.ts';

test('isHttpUrl accepts http and https URLs', () => {
  assert.equal(isHttpUrl('https://example.com/recipe'), true);
  assert.equal(isHttpUrl('http://example.com/recipe'), true);
});

test('isHttpUrl rejects a javascript: URL', () => {
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
});

test('isHttpUrl rejects other non-http(s) schemes', () => {
  assert.equal(isHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isHttpUrl('file:///etc/passwd'), false);
  assert.equal(isHttpUrl('mailto:test@example.com'), false);
});

test('isHttpUrl rejects unparseable values without throwing', () => {
  assert.equal(isHttpUrl(''), false);
  assert.equal(isHttpUrl('not a url'), false);
  assert.equal(isHttpUrl('   '), false);
});
