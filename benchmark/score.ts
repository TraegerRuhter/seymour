/**
 * Scores the ingredient parser against whatever is in benchmark/data/.
 *
 * The golden corpus in tests/fixtures answers "did this change break
 * something?". It cannot answer "is the parser better than it was last week?",
 * because it only holds cases someone already thought of — a hundred or so, all
 * chosen by whoever was fixing a bug at the time. This answers the second
 * question, and prints the biggest disagreement patterns so the answer comes
 * with a to-do list rather than just a number.
 *
 * Never part of `npm run check`. It needs a download and it's a measurement,
 * not a gate.
 *
 *   npm run benchmark:fetch     once, for the built-in dataset
 *   npm run benchmark           scores every file in benchmark/data/
 *   npm run benchmark -- --source nyt --limit 5000 --samples 5
 */

import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { normalizeIngredientName } from '../src/lib/normalize.ts';
import { canonicalUnit } from '../src/lib/units.ts';
import { ingredientViolations } from '../src/lib/invariants.ts';
import { discoverDatasets, type Dataset, type LabelledLine } from './source.ts';

/**
 * Their labels in our vocabulary.
 *
 * This translation is the whole reason an agreement number means anything.
 * NYT tags "carrots" where we say "carrot" and "tablespoon" where we say
 * "tbsp", and records a range as two columns where we average. Scoring the raw
 * strings would mostly measure the difference between two house styles — a
 * parser that is completely correct would score near zero.
 *
 * Both sides go through *our* normalizer, which is the fair comparison: the
 * question is whether we extracted the same ingredient, not whether we spell
 * it their way.
 */
function expectedFrom(row: LabelledLine) {
  const qty = Number(row.qty ?? '');
  const rangeEnd = Number(row.rangeEnd ?? '');
  // A range stored as two columns ("1 to 2" as qty=1, range_end=2); we average.
  const quantity =
    Number.isFinite(qty) && Number.isFinite(rangeEnd) && rangeEnd > qty
      ? (qty + rangeEnd) / 2
      : qty;

  return {
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: row.unit?.trim() ? (canonicalUnit(row.unit.trim()) ?? '') : '',
    name: normalizeIngredientName(row.name ?? ''),
  };
}

const pct = (n: number, of: number) => (of === 0 ? '—' : `${((100 * n) / of).toFixed(1)}%`);

/** Counts keyed by a label, printed largest-first with examples. */
class Tally {
  private counts = new Map<string, { n: number; examples: string[] }>();

  add(key: string, example: string) {
    const entry = this.counts.get(key) ?? { n: 0, examples: [] };
    entry.n++;
    if (entry.examples.length < 20) entry.examples.push(example);
    this.counts.set(key, entry);
  }

  top(n: number) {
    return [...this.counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, n);
  }
}

function scoreDataset(dataset: Dataset, limit: number, samples: number) {
  const rows = dataset.rows.slice(0, limit);

  let all = 0;
  let clean = 0;
  let comparable = 0;
  const correct = { quantity: 0, unit: 0, name: 0, every: 0 };
  const nameShape = new Tally();
  const unitPairs = new Tally();
  const quantityShape = new Tally();
  const brokenRows = new Tally();

  for (const row of rows) {
    all++;
    const got = parseIngredient(row.input);

    // Our own standard, applied to somebody else's data. Unlike agreement this
    // involves no house style at all: a name holding a unit or a digit is
    // broken by the rules we wrote, whatever anyone else would have called
    // that ingredient. It's the half of this that needs no answer key, which
    // is why an unlabelled dataset is still worth having.
    const violations = ingredientViolations(got);
    if (violations.length === 0) clean++;
    for (const v of violations) {
      brokenRows.add(v.slice(v.lastIndexOf('[')), `${row.input}\n      -> ${got.name}`);
    }

    if (!dataset.labelled) continue;
    const expected = expectedFrom(row);
    // A row whose own label is empty teaches us nothing about our parser.
    if (!expected.name) continue;
    comparable++;

    const okQuantity = Math.abs(got.quantity - expected.quantity) < 1e-6;
    const okUnit = got.unit === expected.unit;
    const okName = got.name === expected.name;

    if (okQuantity) correct.quantity++;
    if (okUnit) correct.unit++;
    if (okName) correct.name++;
    if (okQuantity && okUnit && okName) correct.every++;

    const example = `${row.input}\n      ours: ${JSON.stringify({ quantity: got.quantity, unit: got.unit, name: got.name })}\n      theirs: ${JSON.stringify(expected)}`;

    if (!okName) {
      // The *shape* of the disagreement, because a hundred thousand distinct
      // name pairs group into nothing. Whether we kept too much or too little
      // is the part that points at a rule.
      const shape = got.name.includes(expected.name)
        ? 'we kept extra words around their name'
        : expected.name.includes(got.name)
          ? 'we dropped words they kept'
          : 'different name entirely';
      nameShape.add(shape, example);
    }
    if (!okUnit) unitPairs.add(`${expected.unit || '—'} → ${got.unit || '—'}`, example);
    if (!okQuantity) {
      const shape =
        got.quantity === 0
          ? 'we found no amount, they did'
          : expected.quantity === 0
            ? 'we found an amount, they did not'
            : 'both found an amount, different value';
      quantityShape.add(shape, example);
    }
  }

  console.log(`\n  ── ${dataset.id} — ${all.toLocaleString()} lines`);
  if (dataset.labelled && comparable > 0) {
    console.log(`\n  quantity   ${pct(correct.quantity, comparable).padStart(6)}`);
    console.log(`  unit       ${pct(correct.unit, comparable).padStart(6)}`);
    console.log(`  name       ${pct(correct.name, comparable).padStart(6)}`);
    console.log(`  all three  ${pct(correct.every, comparable).padStart(6)}`);
  } else {
    console.log('\n  no labels — scored against our own rules only');
  }
  console.log(`\n  satisfies our own invariants  ${pct(clean, all).padStart(6)}`);

  const section = (title: string, tally: Tally, n: number) => {
    const top = tally.top(n);
    if (top.length === 0) return;
    console.log(`\n  ${title}`);
    for (const [key, { n: count, examples }] of top) {
      console.log(`\n    ${String(count).padStart(6)}  ${key}`);
      for (const ex of examples.slice(0, samples)) console.log(`      ${ex}`);
    }
  };

  section('OUR OWN INVARIANTS, broken', brokenRows, 8);
  section('NAME disagreements', nameShape, 3);
  section('UNIT disagreements (theirs → ours)', unitPairs, 12);
  section('QUANTITY disagreements', quantityShape, 3);
}

function main() {
  const arg = (flag: string, fallback: number) => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? fallback : Number(process.argv[i + 1]);
  };
  const only = process.argv.indexOf('--source');
  const wanted = only === -1 ? null : process.argv[only + 1];

  const datasets = discoverDatasets().filter((d) => !wanted || d.id === wanted);
  if (datasets.length === 0) {
    throw new Error(
      wanted
        ? `No dataset "${wanted}" in benchmark/data/.`
        : 'benchmark/data/ is empty. Run `npm run benchmark:fetch`, or drop any ' +
            'CSV/TSV/TXT of ingredient lines in there — it will be picked up.',
    );
  }

  const started = Date.now();
  for (const dataset of datasets)
    scoreDataset(dataset, arg('--limit', Infinity), arg('--samples', 3));
  console.log(`\n  ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

try {
  main();
} catch (err) {
  console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
