import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disallowedPaths } from '../benchmark/harvest.ts';

/**
 * The robots.txt reading, which is the part of the harvester where being
 * wrong is rude rather than merely broken. Everything else in that script
 * needs a network the sandbox doesn't have; this doesn't.
 */

test('reads the rules meant for everyone', () => {
  assert.deepEqual(
    disallowedPaths(['User-agent: *', 'Disallow: /search', 'Disallow: /admin'].join('\n')),
    ['/search', '/admin'],
  );
});

test('ignores rules addressed to a different crawler', () => {
  // A site telling GPTBot to go away has not told us anything.
  const robots = [
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: *',
    'Disallow: /private',
  ].join('\n');
  assert.deepEqual(disallowedPaths(robots), ['/private']);
});

test('a group that follows ours does not leak into it', () => {
  const robots = ['User-agent: *', 'Disallow: /a', '', 'User-agent: Bingbot', 'Disallow: /b'].join(
    '\n',
  );
  assert.deepEqual(disallowedPaths(robots), ['/a']);
});

test('comments and blank directives are not rules', () => {
  const robots = [
    '# be nice',
    'User-agent: *',
    'Disallow: /x   # no',
    'Disallow:',
    'Allow: /y',
  ].join('\n');
  assert.deepEqual(disallowedPaths(robots), ['/x']);
});

test('field names are case-insensitive, as the standard says', () => {
  assert.deepEqual(disallowedPaths('USER-AGENT: *\nDISALLOW: /nope'), ['/nope']);
});

test('a sitemap line is not a disallow', () => {
  assert.deepEqual(
    disallowedPaths('User-agent: *\nSitemap: https://x.test/sitemap.xml\nDisallow: /q'),
    ['/q'],
  );
});

test('an empty robots.txt disallows nothing', () => {
  assert.deepEqual(disallowedPaths(''), []);
});
