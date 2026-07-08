/*
 * Seymour service worker.
 *
 * Strategy:
 *  - App shell & static assets: stale-while-revalidate (fast loads, silent updates).
 *  - Navigations: network-first with cached fallback, so the library, plan, and
 *    shopping list keep working offline once visited.
 *  - /api/*: network-only — recipe parsing requires connectivity; the client
 *    shows a clear error when offline.
 *  - Recipe images (cross-origin): cache-first once viewed, capped LRU-ish.
 */

const VERSION = 'v2';
const SHELL_CACHE = `seymour-shell-${VERSION}`;
const IMAGE_CACHE = `seymour-images-${VERSION}`;
const IMAGE_LIMIT = 200;

const PRECACHE = ['/', '/recipes', '/plan', '/shopping-list', '/add', '/settings', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== IMAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Trims cache using iterative approach instead of recursion.
 * Prevents stack overflow and excessive await chains.
 */
async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  // Delete all excess entries in a single pass
  if (keys.length > limit) {
    const toDelete = keys.slice(0, keys.length - limit);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API: network only.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  // Cross-origin images (recipe photos): cache-first.
  if (url.origin !== location.origin) {
    if (req.destination === 'image') {
      event.respondWith(
        caches.open(IMAGE_CACHE).then(async (cache) => {
          const hit = await cache.match(req);
          if (hit) return hit;
          try {
            const res = await fetch(req);
            if (res.ok || res.type === 'opaque') {
              cache.put(req, res.clone());
              trimCache(IMAGE_CACHE, IMAGE_LIMIT);
            }
            return res;
          } catch {
            return new Response('', { status: 504 });
          }
        }),
      );
    }
    return;
  }

  // Navigations: network-first, fall back to cache, then to cached shell root.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match('/')) || Response.error()),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    }),
  );
});