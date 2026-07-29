import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCorrection,
  asCorpusLine,
  indexCorrections,
  type Correction,
} from '../src/lib/corrections.ts';
import { parseIngredient, parseIngredientLines } from '../src/lib/ingredient-parser.ts';
import { saveCorrection, withdrawCorrection } from '../src/lib/actions.ts';
import { useCorrectionStore, useRecipeStore } from '../src/lib/stores.ts';
import type { Recipe } from '../src/lib/types.ts';

/**
 * The parser being told it was wrong.
 *
 * Everything the parser knows is a vocabulary someone wrote down; this is the
 * same vocabulary, extendable without a release. The tests that matter most
 * are the ones about *when* a correction takes effect — parsing happens once,
 * at import, so a correction that doesn't reach saved recipes has done nothing
 * the person who made it can see.
 */

/**
 * A line the parser genuinely still gets wrong — one of the corpus's own
 * remaining known gaps. Using a line that already parses correctly would make
 * these tests pass for the wrong reason.
 */
const GAP = '1 cup sugar plus 2 tbsp butter';

function correction(over: Partial<Correction> = {}): Correction {
  return {
    id: 'c1',
    kind: 'line',
    match: GAP,
    got: { name: 'sugar plus 2 tbsp butter', quantity: 1, unit: 'cup' },
    expected: { name: 'sugar' },
    createdAt: '2026-01-01T00:00:00.000Z',
    share: false,
    ...over,
  };
}

const seed = (lines: string[]): Recipe => {
  const recipe: Recipe = {
    id: 'r1',
    title: 'Adobo',
    sourceUrl: '',
    ingredients: parseIngredientLines(lines),
    instructions: [],
    dateAdded: '2026-01-01T00:00:00.000Z',
  };
  useRecipeStore.getState().replaceAll({ r1: recipe });
  useCorrectionStore.getState().replaceAll([]);
  return recipe;
};

const stored = () => useRecipeStore.getState().recipes.r1.ingredients;

// --- applying ---------------------------------------------------------------

test('a line correction overrules the parse for that exact line', () => {
  const index = indexCorrections([correction({ expected: { name: 'sugar', unit: 'tbsp' } })]);
  const [parsed] = parseIngredientLines([GAP], index);
  assert.equal(parsed.name, 'sugar');
  assert.equal(parsed.unit, 'tbsp');
  assert.equal(parsed.correctedBy, 'c1');
});

test('matching ignores case and spacing, which a recipe never means', () => {
  const index = indexCorrections([correction()]);
  const [parsed] = parseIngredientLines(['  1 CUP  sugar   plus 2 tbsp butter '], index);
  assert.equal(parsed.name, 'sugar');
});

test('a name correction applies to lines it has never seen', () => {
  // The one that compounds. "catsup is ketchup" holds for every future recipe,
  // not just the line that prompted it.
  const index = indexCorrections([
    correction({ id: 'c2', kind: 'name', match: 'catsup', expected: { name: 'ketchup' } }),
  ]);
  for (const line of ['1/4 cup catsup', '2 tbsp catsup', 'catsup to taste']) {
    assert.equal(parseIngredientLines([line], index)[0].name, 'ketchup', line);
  }
});

test('a corrected name still goes through the normalizer', () => {
  // Otherwise "Catsup" and "catsup" become two rows and the correction has
  // created the exact problem it was meant to fix.
  const index = indexCorrections([
    correction({ kind: 'name', match: 'catsup', expected: { name: 'Ketchup' } }),
  ]);
  assert.equal(parseIngredientLines(['1/4 cup catsup'], index)[0].name, 'ketchup');
});

test('an unmentioned field keeps whatever the parser said', () => {
  const index = indexCorrections([
    correction({ kind: 'name', match: 'water or chicken broth', expected: { name: 'water' } }),
  ]);
  const [parsed] = parseIngredientLines(['1 cup water or chicken broth'], index);
  assert.equal(parsed.name, 'water');
  assert.equal(parsed.quantity, 1);
  assert.equal(parsed.unit, 'cup');
});

test('a line correction beats a name correction for the same ingredient', () => {
  // The more specific statement wins: someone who corrected an exact line
  // meant that line.
  const index = indexCorrections([
    correction({ id: 'line' }),
    correction({
      id: 'name',
      kind: 'name',
      match: 'sugar plus 2 tbsp butter',
      expected: { name: 'butter' },
    }),
  ]);
  assert.equal(parseIngredientLines([GAP], index)[0].correctedBy, 'line');
});

test('correcting the same thing twice keeps the newer answer', () => {
  useCorrectionStore.getState().replaceAll([]);
  useCorrectionStore.getState().addCorrection(correction({ expected: { name: 'butter' } }));
  useCorrectionStore
    .getState()
    .addCorrection(correction({ id: 'c2', expected: { name: 'sugar' } }));
  const { corrections } = useCorrectionStore.getState();
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].id, 'c2');
});

test('an ingredient with no correction is untouched', () => {
  const ing = parseIngredient('2 cups flour');
  assert.deepEqual(applyCorrection(ing, indexCorrections([correction()])), ing);
});

// --- reaching recipes already saved -----------------------------------------

test('a correction fixes the collection immediately', () => {
  // The whole promise. A rule change needs the Settings button; a correction
  // has to land while you're looking at the row.
  seed([GAP]);
  assert.equal(stored()[0].name, 'sugar plus 2 tbsp butter');

  assert.equal(saveCorrection(correction()), 1);
  assert.equal(stored()[0].name, 'sugar');
});

test('the original line is never rewritten by a correction', () => {
  seed([GAP]);
  saveCorrection(correction());
  assert.equal(stored()[0].originalString, GAP);
});

test('withdrawing a correction gives the parser its answer back', () => {
  // A correction made in haste would otherwise be permanent, and nobody
  // trusts a button they can't take back.
  seed([GAP]);
  saveCorrection(correction());
  assert.equal(stored()[0].name, 'sugar');

  assert.equal(withdrawCorrection('c1'), 1);
  assert.equal(stored()[0].name, 'sugar plus 2 tbsp butter');
  assert.equal(stored()[0].correctedBy, undefined);
});

test('a correction outranks an amount the API supplied', () => {
  // Spoonacular reads these lines better than we do, which is why its parse
  // is otherwise left alone. A person looking at the row still beats it.
  useCorrectionStore.getState().replaceAll([]);
  useRecipeStore.getState().replaceAll({
    r1: {
      id: 'r1',
      title: 'Adobo',
      sourceUrl: '',
      ingredients: [
        {
          name: 'sugar plus 2 tbsp butter',
          quantity: 1,
          unit: 'cup',
          originalString: GAP,
          parsedBy: 'api',
        },
      ],
      instructions: [],
      dateAdded: '2026-01-01T00:00:00.000Z',
    },
  });
  assert.equal(saveCorrection(correction()), 1);
  assert.equal(stored()[0].name, 'sugar');
  assert.equal(stored()[0].parsedBy, 'api');
});

test('recipes the correction does not touch are left alone', () => {
  seed([GAP, '2 cups flour']);
  saveCorrection(correction());
  assert.equal(stored()[1].name, 'flour');
  assert.equal(stored()[1].correctedBy, undefined);
});

// --- feeding back into the corpus -------------------------------------------

test('a correction exports as a corpus line', () => {
  // The point of collecting them: a real case someone hit becomes a case the
  // parser is held to forever.
  assert.equal(asCorpusLine(correction()), `${GAP}\t1\tcup\tsugar`);
});

test('a name correction exports against the name the parser produced', () => {
  const c = correction({ kind: 'name', match: 'catsup', expected: { name: 'ketchup' } });
  assert.equal(
    asCorpusLine({ ...c, got: { name: 'catsup', quantity: 0, unit: '' } }),
    'catsup\t0\t\tketchup',
  );
});

test('sharing is off unless it is turned on', () => {
  // A correction is about a recipe someone is cooking. Opt-in, every time.
  assert.equal(correction().share, false);
});

test('sharing is a separate act from correcting', () => {
  // The fix already happened locally and stays whether this is on or off.
  // Turning it on only offers the line up for review.
  useCorrectionStore.getState().replaceAll([correction()]);
  useCorrectionStore.getState().setShare('c1', true);
  assert.equal(useCorrectionStore.getState().corrections[0].share, true);
  assert.equal(useCorrectionStore.getState().corrections[0].expected.name, 'sugar');
});

test('a submitted correction is stamped so it is not sent twice', () => {
  useCorrectionStore.getState().replaceAll([correction({ share: true })]);
  useCorrectionStore.getState().markSubmitted(['c1'], '2026-02-01T00:00:00.000Z');
  assert.equal(
    useCorrectionStore.getState().corrections[0].submittedAt,
    '2026-02-01T00:00:00.000Z',
  );
});

test('a shared report carries the line and the fix, and nothing about the dish', () => {
  // What goes to the inbox is only ever these fields — asserted here because
  // the shape is a privacy promise, not just a data format.
  const c = correction();
  assert.deepEqual(Object.keys(c).sort(), [
    'createdAt',
    'expected',
    'got',
    'id',
    'kind',
    'match',
    'share',
  ]);
});
