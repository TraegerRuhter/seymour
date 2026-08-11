import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctionsFrom, corpusKeys, mine } from '../benchmark/mine-corrections.ts';
import type { Correction } from '../src/lib/corrections.ts';

/**
 * The mining tool turns "This is wrong" corrections into golden-corpus rows.
 * These pin the four decisions it makes, because each of them is a judgement
 * rather than a transformation.
 */

const correction = (over: Partial<Correction> & Pick<Correction, 'match'>): Correction => ({
  id: over.match,
  kind: 'line',
  got: { name: 'x', quantity: 0, unit: '' },
  expected: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  share: false,
  ...over,
});

test('reads corrections from an export bundle or a bare array', () => {
  const c = correction({ match: 'a' });
  assert.equal(correctionsFrom({ version: 1, corrections: [c] }).length, 1);
  assert.equal(correctionsFrom([c]).length, 1);
  assert.deepEqual(correctionsFrom({ version: 1 }), []);
  assert.deepEqual(correctionsFrom(null), []);
  // A bundle exported before corrections were part of the shape.
  assert.deepEqual(correctionsFrom({ version: 1, recipes: {} }), []);
});

test('corpus keys ignore comments and the ~ that marks a known gap', () => {
  const keys = corpusKeys(
    [
      '# a comment',
      '',
      '2 cups flour\t2\tcup\tflour',
      '~1 stick 1/2 cup of butter\t1\tstick\tbutter',
    ].join('\n'),
  );
  assert.ok(keys.has('2 cups flour'));
  // The ~ is stripped: a known gap still counts as covered, or every run would
  // re-suggest a line the corpus is already tracking.
  assert.ok(keys.has('1 stick 1/2 cup of butter'));
  assert.equal(keys.has('# a comment'), false);
});

test('the newest correction for a target wins', () => {
  const older = correction({
    match: '1 stick 1/2 cup of butter',
    got: { name: '1/2 cup of butter', quantity: 1, unit: 'stick' },
    expected: { name: 'butter' },
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  // "clarified" rather than "unsalted": corpus rows go through
  // normalizeIngredientName, which strips `unsalted` (it isn't in
  // NEVER_DROPPABLE), so that name would collapse to "butter" and this would
  // pass or fail for reasons that have nothing to do with deduping.
  const newer = {
    ...older,
    id: 'b',
    expected: { name: 'clarified butter' },
    createdAt: '2026-02-01T00:00:00.000Z',
  };

  const result = mine([older, newer], '');
  assert.equal(result.duplicates, 1);
  assert.equal(result.rows.length, 1);
  // Contradictory rows in the corpus would be worse than no row at all.
  assert.match(result.rows[0], /clarified butter$/);
});

test('a correction the parser now agrees with is reported, not re-added', () => {
  // The yield clause was fixed generally, so a correction recorded before that
  // is redundant — and saying so is the point, since it means an override can
  // be withdrawn.
  const c = correction({
    match: '2 sprigs fresh oregano to yield 1 tablespoon chopped',
    got: { name: 'oregano to yield 1 tablespoon', quantity: 2, unit: 'sprig' },
    expected: { name: 'oregano' },
  });
  const result = mine([c], '');
  assert.deepEqual(result.rows, []);
  assert.equal(result.agreed.length, 1);
});

test('a line already in the corpus is counted, not suggested again', () => {
  const c = correction({
    match: '1 stick 1/2 cup of butter',
    got: { name: '1/2 cup of butter', quantity: 1, unit: 'stick' },
    expected: { name: 'butter' },
  });
  const result = mine([c], '~1 stick 1/2 cup of butter\t1\tstick\tbutter\n');
  assert.equal(result.covered, 1);
  assert.deepEqual(result.rows, []);
});

test('name corrections are vocabulary, and never become corpus rows', () => {
  // Its `match` is a normalized name, not a line, and the quantity/unit on it
  // belong to whichever row it happened to sit on. Run through the line corpus
  // it scores zero on every field while saying nothing true.
  const c = correction({
    kind: 'name',
    match: 'cream',
    got: { name: 'cream', quantity: 2, unit: 'cup' },
    expected: { name: 'heavy cream' },
  });
  const result = mine([c], '');
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.vocabulary, [{ got: 'cream', expected: 'heavy cream' }]);
});

test('a line correction produces a paste-ready corpus row', () => {
  const c = correction({
    match: '1 16 ounce container of fresh raw oysters in liquid',
    got: { name: 'container of fresh raw oysters in liquid', quantity: 1, unit: '' },
    expected: { name: 'oysters', quantity: 1, unit: 'container' },
  });
  const [row] = mine([c], '').rows;
  const fields = row.split('\t');
  assert.equal(fields.length, 4, 'corpus rows are line/quantity/unit/name, tab-separated');
  assert.equal(fields[0], '1 16 ounce container of fresh raw oysters in liquid');
  assert.equal(fields[2], 'container');
});
