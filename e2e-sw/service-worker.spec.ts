import { test, expect, type Page } from '@playwright/test';

/**
 * The offline cache, against a real production build.
 *
 * Both assertions below correspond to a defect that shipped. Thirty recipe
 * visits used to take the cache from 45 entries to 103 with nothing to stop
 * it, and a third of those were router prefetches stored under a rotating
 * `_rsc` token — written, and impossible to read back.
 */

/** Must match PAGE_LIMIT in public/sw.js. */
const PAGE_LIMIT = 60;

async function cacheContents(page: Page) {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      const keys = await (await caches.open(name)).keys();
      out[name] = keys.map((r) => new URL(r.url).pathname + new URL(r.url).search);
    }
    return out;
  });
}

/** Loads the app and waits for the worker to install and take control. */
async function withServiceWorker(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 30_000,
  });
}

test.describe('The service worker', () => {
  // A production build plus a browsing session; well past the 30s default.
  test.slow();

  test('caps the pages it stores, however long you browse', async ({ page }) => {
    await withServiceWorker(page);

    // Comfortably past the cap. These ids don't resolve to anything, which is
    // fine — the document is the same shell either way, and it's the document
    // being cached that matters.
    for (let i = 1; i <= PAGE_LIMIT + 20; i++) {
      await page.goto(`/recipes/probe-${i}`).catch(() => {});
    }

    const caches_ = await cacheContents(page);
    const pageCache = Object.entries(caches_).find(([name]) => name.includes('pages'));
    expect(pageCache, 'visited pages should have their own cache').toBeTruthy();
    expect(pageCache![1].length).toBeLessThanOrEqual(PAGE_LIMIT);

    // And the shell must not be quietly absorbing them instead.
    const shell = Object.entries(caches_).find(([name]) => name.includes('shell'));
    expect(shell![1].filter((p) => p.startsWith('/recipes/probe-'))).toEqual([]);
  });

  test('never stores a router prefetch, since its key rotates', async ({ page }) => {
    await withServiceWorker(page);

    // Requested directly rather than by clicking a nav link. The rule under
    // test belongs to the worker — "leave any same-origin GET carrying `_rsc`
    // to the network" — and driving it through the router would make this
    // test fail whenever a label or a layout changed, which is not the thing
    // worth being told about.
    const statuses = await page.evaluate(async () => {
      const out: number[] = [];
      for (const path of ['/recipes', '/plan', '/settings']) {
        // Distinct tokens, which is the whole problem: each one would have
        // been stored under a key nothing would ask for again.
        const res = await fetch(`${path}?_rsc=tok${out.length}`, {
          headers: { RSC: '1' },
        });
        out.push(res.status);
      }
      return out;
    });

    // Left to the network means still served, not blocked.
    expect(statuses.every((s) => s === 200)).toBe(true);

    const stored = Object.values(await cacheContents(page)).flat();
    expect(stored.filter((p) => p.includes('_rsc='))).toEqual([]);
  });

  test('still serves a visited page with the network cut', async ({ page, context }) => {
    await withServiceWorker(page);
    await page.goto('/recipes');

    await context.setOffline(true);
    await page.goto('/recipes');
    // The point of caching documents at all: the app still starts offline.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await context.setOffline(false);
  });
});
