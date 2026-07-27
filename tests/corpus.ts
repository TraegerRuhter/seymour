import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The golden corpus reader — item 4 of docs/shopping-parser.md.
 *
 * Not a test file. Two suites walk this data now (the parse expectations and
 * the output invariants of item 10), and a second copy of the loader would be
 * a second place for the `~` convention to drift.
 */

export interface Case {
  line: string;
  expected: { quantity: number; unit: string; name: string; qualifier: string };
  /** A known gap: the expectation is right, the parser isn't there yet. */
  pending: boolean;
}

function loadCorpus(): Case[] {
  const raw = readFileSync(new URL('./fixtures/ingredient-lines.tsv', import.meta.url), 'utf8');
  const cases: Case[] = [];
  raw.split('\n').forEach((row, i) => {
    const text = row.trimEnd();
    if (!text || text.startsWith('#')) return;
    const pending = text.startsWith('~');
    const [line, quantity, unit = '', name, qualifier = ''] = (
      pending ? text.slice(1) : text
    ).split('\t');
    assert.ok(line && name !== undefined, `fixture line ${i + 1} is malformed: ${text}`);
    cases.push({
      line,
      pending,
      expected: { quantity: Number(quantity), unit, name, qualifier },
    });
  });
  return cases;
}

export const CORPUS = loadCorpus();

export const SETTLED = CORPUS.filter((c) => !c.pending);
export const PENDING = CORPUS.filter((c) => c.pending);
