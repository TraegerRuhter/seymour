import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { CORPUS, PENDING, SETTLED } from './corpus.ts';
import { ingredientViolations } from '../src/lib/invariants.ts';

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

const actual = (line: string) => {
  const p = parseIngredient(line);
  return { quantity: p.quantity, unit: p.unit, name: p.name, qualifier: p.qualifier ?? '' };
};

test('the corpus is big enough to be worth having', () => {
  // Guards against the file being emptied or the loader silently matching
  // nothing — a corpus test that walks zero cases passes forever.
  assert.ok(CORPUS.length >= 50, `only ${CORPUS.length} cases loaded`);
  assert.ok(PENDING.length > 0, 'no known gaps recorded');
  assert.ok(SETTLED.length >= 40, 'too few settled cases to catch a regression');
});

test('every settled line parses the way the corpus says', () => {
  const failures: string[] = [];
  for (const { line, expected } of SETTLED) {
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
  for (const { line, expected } of PENDING) {
    if (JSON.stringify(actual(line)) === JSON.stringify(expected)) fixed.push(line);
  }
  assert.deepEqual(
    fixed,
    [],
    `These now parse correctly — drop the leading ~ in tests/fixtures/ingredient-lines.tsv:\n  ${fixed.join('\n  ')}`,
  );
});

test('no settled line parses to something the invariants reject', () => {
  // The rules live in invariants.ts (item 10) and are applied to the
  // aggregated list as well. Here they catch a bad parse at the source, one
  // line at a time, which is a shorter distance to the cause.
  const bad = SETTLED.flatMap(({ line }) => ingredientViolations(parseIngredient(line)));
  assert.deepEqual(bad, [], `\n${bad.join('\n')}`);
});

test('even a known gap parses to something the ledger can render', () => {
  // A gap is a line we already know parses wrongly, so holding it to the full
  // rules would just be the same red twice. It still has to have a name and a
  // usable number, because the shopping list draws it regardless.
  const bad = PENDING.flatMap(({ line }) => ingredientViolations(parseIngredient(line), true));
  assert.deepEqual(bad, [], `\n${bad.join('\n')}`);
});
