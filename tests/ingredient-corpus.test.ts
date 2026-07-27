import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';

/**
 * The golden corpus — item 4 of docs/shopping-parser.md.
 *
 * Every other item on that list is a heuristic, and heuristics regress each
 * other: widening the filler set to fix one line quietly mangles another.
 * This walks a file of real ingredient lines and their expected parse, so the
 * blast radius of any future change is visible in one run.
 *
 * Lines marked `~` are known gaps. They're asserted to *still* be gaps, which
 * sounds perverse but is the useful direction: fixing one makes this fail and
 * tells you to promote it, rather than the corpus quietly recording an
 * improvement nobody noticed.
 */

interface Case {
  line: string;
  expected: { quantity: number; unit: string; name: string; qualifier: string };
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

const actual = (line: string) => {
  const p = parseIngredient(line);
  return { quantity: p.quantity, unit: p.unit, name: p.name, qualifier: p.qualifier ?? '' };
};

const CORPUS = loadCorpus();

test('the corpus is big enough to be worth having', () => {
  // Guards against the file being emptied or the loader silently matching
  // nothing — a corpus test that walks zero cases passes forever.
  assert.ok(CORPUS.length >= 50, `only ${CORPUS.length} cases loaded`);
  assert.ok(
    CORPUS.some((c) => c.pending),
    'no known gaps recorded',
  );
  assert.ok(
    CORPUS.filter((c) => !c.pending).length >= 40,
    'too few settled cases to catch a regression',
  );
});

test('every settled line parses the way the corpus says', () => {
  const failures: string[] = [];
  for (const { line, expected, pending } of CORPUS) {
    if (pending) continue;
    const got = actual(line);
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      failures.push(
        `${line}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(got)}`,
      );
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
});

test('the known gaps are still gaps', () => {
  const fixed: string[] = [];
  for (const { line, expected, pending } of CORPUS) {
    if (!pending) continue;
    if (JSON.stringify(actual(line)) === JSON.stringify(expected)) fixed.push(line);
  }
  assert.deepEqual(
    fixed,
    [],
    `These now parse correctly — drop the leading ~ in tests/fixtures/ingredient-lines.tsv:\n  ${fixed.join('\n  ')}`,
  );
});

test('nothing in the corpus parses to something unusable', () => {
  // Weaker than the exact expectations above, and applied to the known gaps
  // too: whatever the parser does with a line, the result has to be a
  // plausible shopping row. This is item 10 in miniature.
  const bad: string[] = [];
  for (const { line } of CORPUS) {
    const got = actual(line);
    if (!got.name) bad.push(`${line} — empty name`);
    if (/^(of|a|an|and|or|to|for|with)\b/.test(got.name))
      bad.push(`${line} — name starts "${got.name}"`);
    if (!Number.isFinite(got.quantity) || got.quantity < 0) {
      bad.push(`${line} — quantity ${got.quantity}`);
    }
  }
  assert.deepEqual(bad, [], `\n${bad.join('\n')}`);
});
