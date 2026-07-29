import { fileURLToPath } from 'node:url';

/**
 * Where the benchmark corpus comes from and where it lands.
 *
 * The New York Times' own ingredient parser training data — 178,000 lines
 * labelled by hand by news assistants, published under Apache 2.0 alongside
 * the CRF model it trained. See benchmark/README.md for attribution.
 *
 * Pinned to a commit rather than a branch. A benchmark that silently changes
 * underneath you measures nothing: last week's score has to still mean what it
 * said.
 */
export const SOURCE_COMMIT = 'master';

export const SOURCE_URL =
  `https://raw.githubusercontent.com/NYTimes/ingredient-phrase-tagger/${SOURCE_COMMIT}` +
  `/nyt-ingredients-snapshot-2015.csv`;

export const CACHE_PATH = fileURLToPath(
  new URL('./data/nyt-ingredients-2015.csv', import.meta.url),
);

/** One labelled row, in their vocabulary rather than ours. */
export interface LabelledLine {
  input: string;
  name: string;
  qty: string;
  rangeEnd: string;
  unit: string;
  comment: string;
}

/**
 * A CSV reader, because the file has quoted fields containing commas, quotes
 * and newlines — "1 cup peeled and cooked fresh chestnuts (about 20), or 1 cup
 * canned" is one field. Splitting on commas would silently shift every column
 * after it and produce a benchmark that measures the reader instead of the
 * parser.
 */
export function parseCsv(text: string): string[][] {
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
    else if (ch === ',') {
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

/** Reads the cached CSV into rows, keyed by their column names. */
export function readLabelled(text: string): LabelledLine[] {
  const rows = parseCsv(text);
  const header = rows[0]?.map((h) => h.trim()) ?? [];
  const at = (name: string) => header.indexOf(name);
  const [iInput, iName, iQty, iRange, iUnit, iComment] = [
    at('input'),
    at('name'),
    at('qty'),
    at('range_end'),
    at('unit'),
    at('comment'),
  ];
  if (iInput === -1 || iName === -1) {
    throw new Error(`unexpected columns: ${header.join(', ')}`);
  }

  return rows.slice(1).flatMap((r) => {
    if (!r[iInput]?.trim()) return [];
    return [
      {
        input: r[iInput],
        name: r[iName] ?? '',
        qty: r[iQty] ?? '',
        rangeEnd: r[iRange] ?? '',
        unit: r[iUnit] ?? '',
        comment: r[iComment] ?? '',
      },
    ];
  });
}
