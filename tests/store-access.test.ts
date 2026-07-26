import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The UI reads state from the stores and writes it through `actions.ts`.
 *
 * That split isn't stylistic. Checked state, cook logs, plan days and the rest
 * sync to Supabase, and the push that sends them lives in the action, not in
 * the store setter. A component that calls a store setter directly still
 * updates the screen — which is why nothing catches it — but the change never
 * reaches the server, and the next pull merges the stale remote value back
 * over it.
 *
 * That is exactly what "Uncheck all" did: it subscribed to the store's own
 * bulk setter, so unchecking a whole list on one device left every item
 * checked on the server, ready to be re-ticked on the next sync.
 *
 * So: this asserts that every `useXStore((s) => s.foo)` in the UI names a
 * *readable* field. Anything else is a setter reaching around the sync layer.
 */

const READABLE = new Set([
  // Plain state. Everything not in here is a mutation and belongs in actions.
  'recipes',
  'plan',
  'config',
  'archivedPlans',
  'items',
  'staples',
  'unitSystem',
  'hasHydrated',
]);

const SUBSCRIPTION = /use(?:Recipe|Plan|Shopping|Settings|Pantry)Store\(\s*\(s\)\s*=>\s*s\.(\w+)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test('the UI subscribes to state, never to a store setter', () => {
  const root = new URL('../src/', import.meta.url).pathname;
  const offenders: string[] = [];

  for (const file of [
    ...sourceFiles(join(root, 'app')),
    ...sourceFiles(join(root, 'components')),
  ]) {
    const src = readFileSync(file, 'utf8');
    for (const [, field] of src.matchAll(SUBSCRIPTION)) {
      if (!READABLE.has(field)) {
        offenders.push(`${file.slice(root.length)} reads s.${field}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Store setters must be called through src/lib/actions.ts so the sync push runs:\n${offenders.join('\n')}`,
  );
});

test('the guard actually recognises a setter', () => {
  // A test that can only pass is not a guard. This pins the two halves of the
  // rule: a known state field is allowed, a known setter is not.
  assert.equal(READABLE.has('items'), true);
  assert.equal(READABLE.has('uncheckAll'), false);
  assert.deepEqual(
    [...'const x = useShoppingStore((s) => s.uncheckAll);'.matchAll(SUBSCRIPTION)][0][1],
    'uncheckAll',
  );
});
