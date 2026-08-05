import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The one security rule in CLAUDE.md that is called non-negotiable:
 *
 *   > The Supabase anon key is safe in `NEXT_PUBLIC_*` — every table's RLS
 *   > policy restricts it to `auth.uid()`. That is the only reason it's safe,
 *   > so **never add a table without an RLS policy.**
 *
 * Until now that rule was enforced by remembering it. The anon key is shipped
 * to every browser, so a table added without RLS is not a small mistake — it is
 * that table readable by anyone who opens devtools, and nothing in the app
 * would look wrong.
 *
 * This reads the real `schema.sql` rather than a list of table names kept here,
 * because a checker with its own copy of the answer passes forever no matter
 * what ships.
 */

const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

const tablesIn = (sql: string) =>
  [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
const rlsEnabledIn = (sql: string) =>
  new Set(
    [...sql.matchAll(/alter table public\.(\w+) enable row level security/g)].map((m) => m[1]),
  );

/** Policy body per table — a table may have several (parser_reports has insert + select). */
function policiesIn(sql: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  // Up to the next statement-terminating semicolon at the end of a line, which
  // is how every policy in this file is written.
  for (const m of sql.matchAll(/create policy "[^"]+" on public\.(\w+)([\s\S]*?);/g)) {
    out.set(m[1], [...(out.get(m[1]) ?? []), m[2]]);
  }
  return out;
}

test('schema.sql declares at least one table', () => {
  // Guards against the parse silently matching nothing, which would make every
  // assertion below vacuously true.
  assert.ok(tablesIn(SCHEMA).length >= 9, 'expected the schema to still define its tables');
});

test('every table has row level security enabled', () => {
  const enabled = rlsEnabledIn(SCHEMA);
  const missing = tablesIn(SCHEMA).filter((t) => !enabled.has(t));
  assert.deepEqual(
    missing,
    [],
    `these tables have no "enable row level security": ${missing.join(', ')}`,
  );
});

test('every table has at least one policy', () => {
  const policies = policiesIn(SCHEMA);
  const missing = tablesIn(SCHEMA).filter((t) => !policies.has(t));
  assert.deepEqual(missing, [], `these tables have no policy: ${missing.join(', ')}`);
});

test('every policy scopes rows to the signed-in user', () => {
  // RLS enabled with a policy of `using (true)` is RLS in name only. The whole
  // claim about the anon key rests on the row being tied to auth.uid().
  const offenders: string[] = [];
  for (const [table, bodies] of policiesIn(SCHEMA)) {
    for (const body of bodies) {
      if (!body.includes('auth.uid()')) offenders.push(`${table}: ${body.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these policies don't reference auth.uid():\n  ${offenders.join('\n  ')}`,
  );
});

test('the checks above can actually fail', () => {
  // A checker that cannot fail is worse than no checker — it reports green
  // forever. Each rule is handed the thing it exists to catch.
  const unguarded = `
    create table if not exists public.leaky (id uuid primary key);
  `;
  assert.deepEqual(tablesIn(unguarded), ['leaky']);
  assert.equal(rlsEnabledIn(unguarded).has('leaky'), false, 'missing RLS should be detected');
  assert.equal(policiesIn(unguarded).has('leaky'), false, 'missing policy should be detected');

  const wideOpen = `
    create table if not exists public.leaky (id uuid primary key);
    alter table public.leaky enable row level security;
    create policy "leaky is open" on public.leaky
      for select using (true);
  `;
  assert.equal(rlsEnabledIn(wideOpen).has('leaky'), true);
  const body = policiesIn(wideOpen).get('leaky')?.[0] ?? '';
  assert.equal(body.includes('auth.uid()'), false, 'a using(true) policy should be detected');
});
