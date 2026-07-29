/**
 * Collects real ingredient lines from recipe pages into benchmark/data/.
 *
 *   npm run benchmark:harvest -- urls.txt
 *   npm run benchmark:harvest -- urls.txt --delay 2000 --max 200
 *
 * The parser is only as good as the variety of lines it has been held against,
 * and the one measurement that has consistently paid off is "how much of this
 * is food we have never met". Ten Filipino lines taught us `pcs`; a hundred
 * thousand more American ones taught us nothing. This is how to go and get the
 * variety.
 *
 * **This cannot run in the development sandbox** — its proxy reaches
 * raw.githubusercontent.com and essentially nothing else, so every recipe host
 * returns a connection failure. Run it somewhere with ordinary network access.
 *
 * What it keeps is deliberately thin: **ingredient lines only**. No titles, no
 * instructions, no images, no URLs. That's everything a parser benchmark needs
 * and nothing that amounts to warehousing someone's recipe. The output is
 * gitignored along with the rest of benchmark/data/.
 *
 * It is meant to be a polite guest:
 *
 *   - robots.txt is fetched once per host and honoured.
 *   - One request at a time, with a delay between them (1s by default).
 *   - A 429 or 403 stops that host for the rest of the run.
 *   - Already-harvested URLs are skipped, so re-running resumes rather than
 *     re-fetching.
 */

import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractRecipeFromHtml, extractRecipeFromMicrodata, fetchHtml } from '../src/lib/scrape.ts';
import { DATA_DIR } from './source.ts';

const OUTPUT = join(DATA_DIR, 'harvested.txt');
const SEEN = join(DATA_DIR, '.harvested-urls');

/**
 * The subset of robots.txt that matters here: the `User-agent: *` group's
 * Disallow paths. Not a complete implementation — it ignores Allow overrides
 * and wildcards, which makes it *stricter* than the standard rather than
 * looser, and erring toward not fetching is the right way to be wrong.
 */
export function disallowedPaths(robots: string): string[] {
  const paths: string[] = [];
  let inStarGroup = false;
  for (const raw of robots.split('\n')) {
    const line = raw.split('#')[0].trim();
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(field)) inStarGroup = value === '*';
    else if (inStarGroup && /^disallow$/i.test(field) && value) paths.push(value);
  }
  return paths;
}

const robotsByHost = new Map<string, string[]>();

async function mayFetch(url: URL): Promise<boolean> {
  if (!robotsByHost.has(url.host)) {
    let rules: string[] = [];
    try {
      const res = await fetch(new URL('/robots.txt', url.origin), {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      // No robots.txt is permission; an unreadable one is not a reason to
      // guess, so anything other than a 2xx is treated as no rules.
      if (res.ok) rules = disallowedPaths(await res.text());
    } catch {
      rules = [];
    }
    robotsByHost.set(url.host, rules);
  }
  const rules = robotsByHost.get(url.host)!;
  return !rules.some((path) => url.pathname.startsWith(path));
}

const USER_AGENT = 'seymour-benchmark/1.0 (parser evaluation; ingredient lines only)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
}

async function main() {
  const listPath = process.argv[2];
  if (!listPath || listPath.startsWith('--')) {
    throw new Error(
      'Usage: npm run benchmark:harvest -- <file-of-urls> [--delay ms] [--max n]\n' +
        '  One URL per line; blank lines and # comments ignored.',
    );
  }

  const delay = arg('--delay', 1000);
  const max = arg('--max', Infinity);

  const urls = (await readFile(listPath, 'utf8'))
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  await mkdir(DATA_DIR, { recursive: true });
  const seen = new Set(
    existsSync(SEEN) ? readFileSync(SEEN, 'utf8').split('\n').filter(Boolean) : [],
  );
  const stoppedHosts = new Set<string>();

  let fetched = 0;
  let lines = 0;
  const skipped = { seen: 0, robots: 0, noRecipe: 0, failed: 0 };

  for (const raw of urls) {
    if (fetched >= max) break;
    if (seen.has(raw)) {
      skipped.seen++;
      continue;
    }

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      skipped.failed++;
      continue;
    }
    if (stoppedHosts.has(url.host)) continue;

    if (!(await mayFetch(url))) {
      skipped.robots++;
      // Recorded as seen: robots.txt saying no is an answer, and re-asking on
      // every run would be the rude part.
      await appendFile(SEEN, raw + '\n');
      continue;
    }

    try {
      const html = await fetchHtml(raw);
      const recipe = extractRecipeFromHtml(html, raw) ?? extractRecipeFromMicrodata(html, raw);
      if (!recipe?.ingredientLines.length) {
        skipped.noRecipe++;
      } else {
        // Ingredient lines and nothing else — see the note at the top.
        await appendFile(OUTPUT, recipe.ingredientLines.join('\n') + '\n');
        lines += recipe.ingredientLines.length;
      }
      fetched++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/\b(429|403)\b/.test(message)) {
        console.log(`  ${url.host} asked us to stop — skipping the rest of it`);
        stoppedHosts.add(url.host);
        continue;
      }
      skipped.failed++;
    }

    await appendFile(SEEN, raw + '\n');
    seen.add(raw);
    if (fetched % 25 === 0) console.log(`  ${fetched} pages, ${lines} lines`);
    await sleep(delay);
  }

  console.log(`\n  ${fetched} pages → ${lines} ingredient lines`);
  console.log(`  ${OUTPUT}`);
  const reasons = Object.entries(skipped).filter(([, n]) => n > 0);
  if (reasons.length) console.log(`  skipped: ${reasons.map(([k, n]) => `${n} ${k}`).join(', ')}`);
  console.log(`\n  Now run: npm run benchmark\n`);
}

// Only when run as a script. Without this, importing anything from here — the
// robots.txt reader has tests — starts a harvest and exits the process.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  });
}
