/**
 * Downloads the benchmark corpus into a local cache.
 *
 * Run once; every `npm run benchmark` after that reads from disk. The file is
 * ~20 MB and 178,000 rows, which is exactly why it isn't in the repo: the
 * golden corpus in tests/fixtures runs on every CI build and has to stay small
 * enough to be read by a person. This is the other kind of dataset — big,
 * external, and consulted deliberately.
 */

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CACHE_PATH, SOURCE_URL } from './source.ts';

async function main() {
  const force = process.argv.includes('--force');

  if (!force) {
    const existing = await stat(CACHE_PATH).catch(() => null);
    if (existing) {
      console.log(`Already cached: ${CACHE_PATH} (${(existing.size / 1e6).toFixed(1)} MB)`);
      console.log('Pass --force to re-download.');
      return;
    }
  }

  console.log(`Fetching ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} — could not reach the dataset`);

  const body = await res.text();
  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, body, 'utf8');

  const rows = body.split('\n').length - 2; // header + trailing newline
  console.log(`Cached ${rows.toLocaleString()} rows to ${CACHE_PATH}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
