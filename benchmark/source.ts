import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where benchmark data comes from.
 *
 * One dataset was built in — NYT's, because it's the one with labels. But the
 * sandbox this is developed in can only reach raw.githubusercontent.com, and
 * most of the interesting food datasets live elsewhere: Open Food Facts, USDA
 * FoodData Central, RecipeNLG, Kaggle. So the rule here is that **anything
 * dropped into `benchmark/data/` is scored**, whether this file knows about it
 * or not. Downloading is a convenience, not a requirement.
 *
 * Two kinds of file are useful, and the second kind is easy to underrate:
 *
 *   - **Labelled** — a table with the line and someone's parse of it. Scores
 *     agreement per field.
 *   - **Unlabelled** — recipe lines and nothing else. Still worth a great deal,
 *     because the invariants don't need an answer key to say a row is broken.
 *     A million international ingredient lines would find vocabulary gaps that
 *     no amount of staring at our own corpus will.
 */

export const DATA_DIR = fileURLToPath(new URL('./data/', import.meta.url));

/**
 * The one dataset with a fetch script, because it's the one with labels.
 * Pinned to a commit rather than a branch: a benchmark that changes underneath
 * you measures nothing, and last week's score has to still mean what it said.
 */
export const BUILT_IN = {
  id: 'nyt',
  file: 'nyt-ingredients-2015.csv',
  url:
    'https://raw.githubusercontent.com/NYTimes/ingredient-phrase-tagger/master' +
    '/nyt-ingredients-snapshot-2015.csv',
  attribution: 'The New York Times Company, Apache License 2.0',
};

export const CACHE_PATH = join(DATA_DIR, BUILT_IN.file);

/** One row: the raw line, plus whatever the source claims it means. */
export interface LabelledLine {
  input: string;
  /** Absent when the file is just lines — see `Dataset.labelled`. */
  name?: string;
  qty?: string;
  rangeEnd?: string;
  unit?: string;
}

export interface Dataset {
  id: string;
  rows: LabelledLine[];
  /** False when there's nothing to compare against and only invariants apply. */
  labelled: boolean;
}

/**
 * Column names a food dataset might plausibly use for each field.
 *
 * Matched case-insensitively against the header row, first hit wins. This is
 * what lets an unfamiliar CSV be scored without anyone writing an adapter —
 * the alternative is a config file per dataset, which is friction at exactly
 * the moment someone is curious enough to try one.
 */
const COLUMN_ALIASES = {
  input: [
    'input',
    'line',
    'original',
    'originalstring',
    'ingredient',
    'ingredients',
    'text',
    'raw',
  ],
  name: ['name', 'nameclean', 'ingredient_name', 'food', 'product_name'],
  qty: ['qty', 'quantity', 'amount'],
  rangeEnd: ['range_end', 'rangeend'],
  unit: ['unit', 'units', 'measure', 'uom'],
} as const;

/**
 * A CSV/TSV reader, because these files have quoted fields containing commas,
 * quotes and newlines — "1 cup chestnuts (about 20), or 1 cup canned" is one
 * field. Splitting on the delimiter would silently shift every column after it
 * and produce a benchmark that measures the reader instead of the parser.
 */
export function parseTable(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch !== '"') {
        field += ch;
      } else if (text[i + 1] === '"') {
        field += '"'; // an escaped quote inside a quoted field
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Tab or comma, whichever the header row has more of. */
const sniffDelimiter = (header: string) =>
  (header.match(/\t/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? '\t' : ',';

function columnIndexes(header: string[]) {
  const lower = header.map((h) => h.trim().toLowerCase().replace(/[\s-]/g, ''));
  const find = (aliases: readonly string[]) => {
    for (const alias of aliases) {
      const i = lower.indexOf(alias);
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    input: find(COLUMN_ALIASES.input),
    name: find(COLUMN_ALIASES.name),
    qty: find(COLUMN_ALIASES.qty),
    rangeEnd: find(COLUMN_ALIASES.rangeEnd),
    unit: find(COLUMN_ALIASES.unit),
  };
}

/**
 * Reads one file into rows, working out for itself what shape it is.
 *
 * Falls back to one-line-per-row when no header column looks like an
 * ingredient line — which is the right reading of a plain `.txt` dump, and
 * also of a table nobody has told us about. Unlabelled data still scores
 * against the invariants, so a file we half-understand is better than a file
 * we refuse.
 */
export function readDataset(id: string, text: string, filename: string): Dataset {
  const asPlainLines = (): Dataset => ({
    id,
    labelled: false,
    rows: text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((input) => ({ input })),
  });

  if (extname(filename).toLowerCase() === '.txt') return asPlainLines();

  const firstLine = text.slice(0, text.indexOf('\n'));
  const rows = parseTable(text, sniffDelimiter(firstLine));
  const header = rows[0] ?? [];
  const at = columnIndexes(header);
  if (at.input === -1) return asPlainLines();

  const parsed = rows.slice(1).flatMap((r): LabelledLine[] => {
    const input = r[at.input]?.trim();
    if (!input) return [];
    return [
      {
        input,
        ...(at.name !== -1 ? { name: r[at.name] ?? '' } : {}),
        ...(at.qty !== -1 ? { qty: r[at.qty] ?? '' } : {}),
        ...(at.rangeEnd !== -1 ? { rangeEnd: r[at.rangeEnd] ?? '' } : {}),
        ...(at.unit !== -1 ? { unit: r[at.unit] ?? '' } : {}),
      },
    ];
  });

  return { id, rows: parsed, labelled: at.name !== -1 };
}

/** Every file sitting in benchmark/data/, whether or not we put it there. */
export function discoverDatasets(): Dataset[] {
  let files: string[];
  try {
    files = readdirSync(DATA_DIR).filter((f) => /\.(csv|tsv|txt)$/i.test(f));
  } catch {
    return [];
  }
  return files
    .sort()
    .map((f) => readDataset(basename(f, extname(f)), readFileSync(join(DATA_DIR, f), 'utf8'), f));
}
