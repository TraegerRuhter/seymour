/**
 * Scores the parser against 178,000 hand-labelled ingredient lines.
 *
 * The golden corpus in tests/fixtures answers "did this change break
 * something?". It cannot answer "is the parser better than it was last week?",
 * because it only holds cases someone already thought of — about 110 of them,
 * all chosen by whoever was fixing a bug at the time. This answers the second
 * question, and prints the biggest disagreement patterns so the answer comes
 * with a to-do list rather than just a number.
 *
 * Never part of `npm run check`. It needs a 20 MB download and takes seconds,
 * neither of which belongs in CI.
 *
 *   npm run benchmark:fetch     once
 *   npm run benchmark           any time
 *   npm run benchmark -- --limit 5000 --samples 5
 */

import { readFile } from 'node:fs/promises';
import { parseIngredient } from '../src/lib/ingredient-parser.ts';
import { normalizeIngredientName } from '../src/lib/normalize.ts';
import { canonicalUnit } from '../src/lib/units.ts';
import { ingredientViolations } from '../tests/invariants.ts';
import { CACHE_PATH, readLabelled, type LabelledLine } from './source.ts';

/**
 * Their labels in our vocabulary.
 *
 * This translation is the whole reason the number means anything. They tag
 * "carrots" where we say "carrot", "tablespoon" where we say "tbsp", and they
 * record a range as two columns where we average. Scoring the raw strings
 * would mostly measure the difference between two house styles — a parser that
 * is completely correct would score near zero.
 *
 * Both sides go through *our* normalizer, which is the fair comparison: the
 * question is whether we extracted the same ingredient, not whether we spell
 * it their way.
 */
function expectedFrom(row: LabelledLine) {
  const qty = Number(row.qty);
  const rangeEnd = Number(row.rangeEnd);
  // They store "1 to 2" as qty=1, range_end=2; we average it.
  const quantity =
    Number.isFinite(qty) && Number.isFinite(rangeEnd) && rangeEnd > qty
      ? (qty + rangeEnd) / 2
      : qty;

  return {
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: row.unit.trim() ? (canonicalUnit(row.unit.trim()) ?? '') : '',
    name: normalizeIngredientName(row.name),
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

async function main() {
  const arg = (flag: string, fallback: number) => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? fallback : Number(process.argv[i + 1]);
  };
  const limit = arg('--limit', Infinity);
  const samples = arg('--samples', 3);

  const text = await readFile(CACHE_PATH, 'utf8').catch(() => {
    throw new Error(`No cached corpus. Run: npm run benchmark:fetch`);
  });

  const rows = readLabelled(text).slice(0, limit);
  const started = Date.now();

  let all = 0;
  let clean = 0;
  const correct = { quantity: 0, unit: 0, name: 0, every: 0 };
  const nameShape = new Tally();
  const unitPairs = new Tally();
  const quantityShape = new Tally();
  const brokenRows = new Tally();

  for (const row of rows) {
    const expected = expectedFrom(row);
    // A row whose own label is empty teaches us nothing about our parser.
    if (!expected.name) continue;
    all++;

    const got = parseIngredient(row.input);

    // Our own standard, applied to somebody else's data. Unlike agreement
    // with NYT this involves no house style at all: a name holding a unit or
    // a digit is broken by the rules we wrote, whatever anyone else would
    // have called that ingredient. It's the honest half of this benchmark.
    const violations = ingredientViolations(got);
    if (violations.length === 0) clean++;
    for (const v of violations) {
      brokenRows.add(v.slice(v.lastIndexOf('[')), `${row.input}\n      -> ${got.name}`);
    }

    const okQuantity = Math.abs(got.quantity - expected.quantity) < 1e-6;
    const okUnit = got.unit === expected.unit;
    const okName = got.name === expected.name;

    if (okQuantity) correct.quantity++;
    if (okUnit) correct.unit++;
    if (okName) correct.name++;
    if (okQuantity && okUnit && okName) correct.every++;

    const example = `${row.input}\n      ours: ${JSON.stringify({ quantity: got.quantity, unit: got.unit, name: got.name })}\n      NYT:  ${JSON.stringify(expected)}`;

    if (!okName) {
      // The *shape* of the disagreement, because 178k distinct name pairs
      // group into nothing. Whether we kept too much or too little is the
      // part that points at a rule.
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

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n  ${all.toLocaleString()} labelled lines, scored in ${elapsed}s\n`);
  console.log(`  quantity   ${pct(correct.quantity, all).padStart(6)}`);
  console.log(`  unit       ${pct(correct.unit, all).padStart(6)}`);
  console.log(`  name       ${pct(correct.name, all).padStart(6)}`);
  console.log(`  all three  ${pct(correct.every, all).padStart(6)}`);
  console.log(`\n  rows that satisfy our own invariants  ${pct(clean, all).padStart(6)}\n`);

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
  console.log();
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
