import { defineConfig, devices } from '@playwright/test';

const PORT = 3101;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * A second suite, for the one file the main one can't reach.
 *
 * `AppProviders` only registers the service worker when NODE_ENV is
 * production, and the main e2e suite runs against `next dev` — so until this
 * existed, no test had ever executed a line of `public/sw.js`. It has since
 * produced two real defects: an offline cache that grew without a ceiling, and
 * router prefetches stored under a rotating key that could never be read.
 *
 * Separate from playwright.config.ts rather than a second project inside it,
 * because these need a production build first and everything else is better
 * off not paying for one.
 */
export default defineConfig({
  testDir: './e2e-sw',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker: the tests share a service worker registration and an origin's
  // worth of caches, so running them side by side would have them stepping on
  // each other's storage.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // A cold production build is the slow part, not the serve.
    timeout: 300_000,
  },
});
