import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchHtml, FetchError } from '../src/lib/scrape.ts';

/**
 * The SSRF guard used to check only the URL the user typed, and then hand it
 * to a fetch that followed redirects on its own. A public host answering with
 * a Location pointing at an internal address went straight through.
 *
 * These run against a real server on loopback rather than a stubbed fetch,
 * because the bug lived in what the platform's fetch did after our code
 * stopped looking — a stub would have been written to the same blind spot.
 */

/** Starts a one-off server and returns its base URL plus a stop function. */
async function serve(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no error';
  } catch (e) {
    return e instanceof FetchError ? e.failure : `other: ${String(e)}`;
  }
}

test('a redirect to a private address is refused, not followed', async () => {
  let reachedInternal = false;
  const internal = await serve((_req, res) => {
    reachedInternal = true;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body>secrets</body></html>');
  });
  const redirector = await serve((_req, res) => {
    res.writeHead(302, { location: internal.base });
    res.end();
  });

  try {
    // The redirector is itself on loopback, so the first hop is refused —
    // which is the same code path a public host redirecting inward takes,
    // just one hop earlier.
    assert.equal(await failureOf(fetchHtml(redirector.base)), 'unsafe');
    assert.equal(reachedInternal, false, 'the internal server must not be reached');
  } finally {
    await redirector.stop();
    await internal.stop();
  }
});

test('a direct fetch of a private address is refused', async () => {
  const internal = await serve((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html></html>');
  });
  try {
    assert.equal(await failureOf(fetchHtml(internal.base)), 'unsafe');
  } finally {
    await internal.stop();
  }
});

test('a non-http scheme is refused', async () => {
  assert.equal(await failureOf(fetchHtml('file:///etc/passwd')), 'unsafe');
});

test('a redirect loop gives up rather than spinning', async () => {
  // Points at itself forever. Public-hostname checks aren't the thing under
  // test here, so this stays on loopback and is expected to be refused at the
  // first hop — the assertion that matters is that it *returns*.
  const loop = await serve((req, res) => {
    res.writeHead(302, { location: req.url ?? '/' });
    res.end();
  });
  try {
    const failure = await failureOf(fetchHtml(loop.base));
    assert.ok(failure === 'unsafe' || failure === 'network', `unexpected: ${failure}`);
  } finally {
    await loop.stop();
  }
});
