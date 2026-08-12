/**
 * Turns "This is wrong" corrections into golden-corpus rows.
 *
 *   npm run corrections:mine -- seymour-backup.json
 *   npm run corrections:mine -- seymour-backup.json --write
 *
 * The loop this closes: someone hits a line the parser reads wrongly, fixes it
 * in the app, and that fix becomes a case the parser is held to forever. Until
 * now the correction stayed on that person's device and `asCorpusLine` had no
 * caller.
 *
 * **Nothing leaves the machine.** The input is the JSON that Settings → Export
 * all data already writes, read off disk. There is no server here and no
 * network call; a correction is about a recipe someone is cooking, and mining
 * it shouldn't require an account.
 *
 * Reading other people's shared corrections is a different job with different
 * rules. `parser_reports` is `select using (auth.uid() = user_id)`, so no
 * client can read another user's rows however it asks — that pool is reachable
 * only from the Supabase SQL editor, by the maintainer, deliberately.
 *
 * ## What comes out
 *
 * Two things, because corrections are worth more as a measurement than as
 * fixture lines at the volumes a personal app produces:
 *
 *   - **corpus rows**, in `tests/fixtures/ingredient-lines.tsv` syntax, ready
 *     to paste. Adding one is what makes a case permanent.
 *   - **`benchmark/data/corrections.tsv`** with `--write`. The benchmark scores
 *     every file in that directory with no adapter to write, so corrections
 *     become a second dataset next to NYT's — one with no house style in it at
 *     all, because every row is a line a person looked at and called wrong.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { asCorpusLine, type Correction } from '../src/lib/corrections.ts';
import { normalizeIngredientName } from '../src/lib/normalize.ts';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { DATA_DIR } from './source.ts';

const CORPUS_PATH = new URL('../tests/fixtures/ingredient-lines.tsv', import.meta.url);

/** The line a corpus row keys on — first tab-separated field. */
const keyOf = (row: string) => row.split('\t')[0].trim().toLowerCase();

/**
 * Corrections out of an export bundle, or out of a bare array.
 *
 * Both shapes are accepted because the bundle is what the app writes and a
 * bare array is what a `select` in the SQL editor produces. Neither is worth
 * making the other's problem.
 */
export function correctionsFrom(json: unknown): Correction[] {
  if (Array.isArray(json)) return json as Correction[];
  if (json && typeof json === 'object') {
    const bundle = json as { corrections?: unknown };
    if (Array.isArray(bundle.corrections)) return bundle.corrections as Correction[];
  }
  return [];
}

/** Lines already in the golden corpus, `~`-marked gaps included. */
export function corpusKeys(tsv: string): Set<string> {
  return new Set(
    tsv
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => keyOf(l.replace(/^~/, ''))),
  );
}

export interface Mined {
  /** Corpus-syntax rows for `line` corrections the corpus doesn't cover yet. */
  rows: string[];
  /** Already present in the corpus — no action, but worth reporting. */
  covered: number;
  /**
   * Corrections the parser now agrees with. The parser improved since the
   * correction was made, which is worth knowing: it's a candidate for
   * withdrawing the override, not for a new fixture.
   */
  agreed: string[];
  /** Same target corrected more than once; the newest wins. */
  duplicates: number;
  /**
   * `name` corrections, which are **not** corpus rows.
   *
   * A `name` correction says "wherever the parser produces X, it should have
   * produced Y" — a statement about `normalizeIngredientName`, not about
   * reading one line. Its `match` is a normalized name rather than an
   * ingredient line, and the quantity/unit on it are incidental to whichever
   * row it happened to be attached to.
   *
   * Running one through the line corpus produces nonsense: "cream → 2 cup
   * heavy cream" parses as a bare name with no amount and scores zero on every
   * field, which would drag the benchmark down while saying nothing true.
   *
   * They're still valuable — they point at `normalize.ts`, usually at a
   * descriptor that should be in `NEVER_DROPPABLE` or a synonym that maps the
   * wrong way — so they're reported separately rather than dropped.
   */
  vocabulary: { got: string; expected: string }[];
}

export function mine(corrections: Correction[], corpus: string): Mined {
  const known = corpusKeys(corpus);

  // Newest per target. A person who corrects the same line twice meant the
  // second one; keeping both would put contradictory rows in the corpus.
  const newest = new Map<string, Correction>();
  let duplicates = 0;
  for (const c of [...corrections].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = `${c.kind}:${c.match.trim().toLowerCase()}`;
    if (newest.has(key)) duplicates++;
    newest.set(key, c);
  }

  const rows: string[] = [];
  const agreed: string[] = [];
  const vocabulary: { got: string; expected: string }[] = [];
  let covered = 0;

  for (const c of newest.values()) {
    // A name correction is a statement about the vocabulary, not about a line.
    // See the note on `Mined.vocabulary`.
    if (c.kind === 'name') {
      const expected = { ...c.got, ...c.expected };
      if (normalizeIngredientName(expected.name) !== c.got.name) {
        vocabulary.push({ got: c.got.name, expected: normalizeIngredientName(expected.name) });
      }
      continue;
    }

    const row = asCorpusLine(c);
    const [line, quantity, unit, name] = row.split('\t');

    // Does the parser already produce this? If so the correction is redundant
    // — it was fixed generally at some point since.
    const now = parseIngredient(line);
    if (
      String(now.quantity) === quantity &&
      (now.unit ?? '') === (unit ?? '') &&
      now.name === name
    ) {
      agreed.push(line);
      continue;
    }

    if (known.has(keyOf(row))) {
      covered++;
      continue;
    }
    rows.push(row);
  }

  return { rows, covered, agreed, duplicates, vocabulary };
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const file = args.find((a) => !a.startsWith('--'));

  if (!file) {
    console.error(
      'Usage: npm run corrections:mine -- <export.json> [--write]\n\n' +
        '  <export.json>  the file Settings → Export all data writes,\n' +
        '                 or a bare JSON array of corrections.\n' +
        '  --write        also write benchmark/data/corrections.tsv, which\n' +
        '                 `npm run benchmark` will pick up on its own.',
    );
    process.exitCode = 1;
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(resolve(file), 'utf8'));
  } catch (e) {
    console.error(`Could not read ${file} as JSON: ${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const corrections = correctionsFrom(json);
  if (corrections.length === 0) {
    console.error(
      'No corrections in that file.\n\n' +
        'Exports written before corrections were included in the bundle will\n' +
        'not have them — re-export from Settings → Export all data.',
    );
    process.exitCode = 1;
    return;
  }

  const result = mine(corrections, readFileSync(CORPUS_PATH, 'utf8'));

  console.log(`\n  ${corrections.length} correction${corrections.length === 1 ? '' : 's'} read`);
  if (result.duplicates) console.log(`  ${result.duplicates} superseded by a later correction`);
  if (result.covered) console.log(`  ${result.covered} already in the golden corpus`);
  if (result.agreed.length) {
    console.log(
      `\n  ${result.agreed.length} the parser now agrees with — fixed generally since,\n` +
        '  so these are candidates for withdrawing rather than new fixtures:',
    );
    for (const line of result.agreed) console.log(`      ${line}`);
  }

  if (result.vocabulary.length) {
    console.log(
      `\n  ${result.vocabulary.length} name correction${result.vocabulary.length === 1 ? '' : 's'} — these are vocabulary, not corpus rows.\n` +
        '  They belong in normalize.ts (a NEVER_DROPPABLE descriptor, or a synonym\n' +
        '  mapping the wrong way), and are deliberately kept out of the benchmark:',
    );
    for (const v of result.vocabulary) console.log(`      ${v.got}  ->  ${v.expected}`);
  }

  if (result.rows.length === 0) {
    console.log('\n  No new line cases to add.\n');
    return;
  }

  console.log(
    `\n  ${result.rows.length} new case${result.rows.length === 1 ? '' : 's'} — paste into tests/fixtures/ingredient-lines.tsv:\n`,
  );
  for (const row of result.rows) console.log(`  ${row}`);

  if (write) {
    mkdirSync(DATA_DIR, { recursive: true });
    const out = resolve(DATA_DIR, 'corrections.tsv');
    writeFileSync(out, `line\tquantity\tunit\tname\n${result.rows.join('\n')}\n`);
    console.log(`\n  Wrote ${out}\n  — npm run benchmark will score it alongside NYT's set.`);
  }
  console.log('');
}

// Importable for tests without running main — see the harvest.ts note in
// CLAUDE.md: without this guard, importing exits the test runner. pathToFileURL
// rather than a hand-built `file://`, which mangles spaces and Windows paths.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
