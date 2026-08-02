# Working on Seymour

This file is for whoever picks the project up next — a new session, or you in a
month. `README.md` says what Seymour *is*. This says how to work on it: what the
conventions are, which of them are load-bearing, and which mistakes have already
been paid for.

Read this first, then whichever of these the task touches:

| Document | When to read it |
| --- | --- |
| [`README.md`](README.md) | What the app does, how to run it, how sync and deployment work |
| [`docs/design-prospectus.md`](docs/design-prospectus.md) | Anything visual. It's the diagnosis and the plan, with a status column |
| [`docs/voice.md`](docs/voice.md) | Anything with words in it |
| [`docs/shopping-parser.md`](docs/shopping-parser.md) | The ingredient parser. Ten items, all shipped |
| [`benchmark/README.md`](benchmark/README.md) | Measuring the parser against outside data |

---

## The workflow

Every change follows the same loop. It isn't ceremony — each step has caught
something real.

```bash
git fetch origin main && git checkout -b <branch> origin/main
# ...work...
npm run format        # prettier writes; format:check in CI only reads
npm run check         # tests + typecheck + lint + format:check + build
npm run e2e           # anything touching a component or a page
git commit && git push -u origin <branch>
# open a PR, wait for CI green, squash-merge, sync main, delete the branch
```

- **Small PRs.** One idea each. Fifteen shipped in the last session; none took
  more than a couple of hours to review.
- **`npm run check` before every push.** It's what CI runs. There is no reason
  to discover a lint failure from a robot.
- **Visual work gets looked at in a browser.** Not "the test passes" — looked
  at. See *Verify, don't reason* below; the most expensive bug of the last
  session was invisible to a passing unit test.
- **Never commit to `main` directly.**

Commands worth knowing:

```bash
npm run dev                 # localhost:3000
npm test                    # 425 unit tests, node:test via tsx, ~14s
npm run e2e                 # Playwright, against `next dev` on port 3100
npm run e2e:sw              # service worker suite, needs a production build
npm run benchmark:fetch     # once — 20 MB into gitignored benchmark/data/
npm run benchmark           # scores every file in benchmark/data/
```

---

## The map

Thin backend, rich client. Four server routes exist (`/api/parse`,
`/api/parse-text`, `/api/discover`, `/auth/callback`); everything else is the
browser.

```
src/lib/stores.ts        Zustand stores, persisted to IndexedDB via localforage
src/lib/actions.ts       cross-store orchestration — the ONLY place that
                         coordinates stores, and the single place sync hooks in
src/lib/sync.ts          optional Supabase sync: push per record, pull, realtime
src/lib/ingredient-parser.ts   one line of text → structured fields
src/lib/normalize.ts     names: synonyms, stemming, which descriptors survive
src/lib/units.ts         unit aliases, conversion, human-readable formatting
src/lib/aggregate.ts     many parsed ingredients → one shopping list
src/lib/invariants.ts    rules a shopping row must never break
src/lib/corrections.ts   user-supplied overrides applied at parse time
```

**If a change touches more than one store, it belongs in `actions.ts`.** That
rule is why adding sync required no rewiring: there was already exactly one
place that knew a recipe delete has to re-aggregate the list.

`src/lib/stores.ts` has a comment at the top about `version` and `migrate`.
Believe it. Adding an *optional* field needs no bump; anything else needs both a
bump and a migration, or existing users silently reset to defaults.

---

## The parser, in depth

This is the largest and most-worked-on subsystem, and the one most likely to be
what you're here for. `docs/shopping-parser.md` is ten for ten — every item on
it shipped. What follows is how the machinery fits together.

### The pipeline

`parseIngredient` is a list of named stages in `src/lib/ingredient-parser.ts`.
**The order is the algorithm**, and reordering it is a behaviour change:

```ts
const STAGES: Stage[] = [
  readLeadingFiller, readDerived, readQuantity, readSize, readBareUnit, readUnit,
  readParenthetical, readEcho, readPlusAmount, readOpenEnded, splitNotes,
  truncateAtYield, readAlternative, truncateAtInstruction, readTrailingUnit,
  normalizeName, readQualifier,
];
```

Each stage takes what it recognizes off the front (or the end) and leaves the
rest. `parseIngredientLines` wraps it: applies corrections, splits compound
lines (`Salt and pepper` → two rows), then drops lines that name nothing.

Adding a stage is usually right. Widening an existing regex is usually how you
break four other lines.

### The golden corpus, and the ratchet

`tests/fixtures/ingredient-lines.tsv` — ~130 real lines and their expected parse,
tab-separated:

```
line <TAB> quantity <TAB> unit <TAB> name <TAB> qualifier
```

Adding a case is one line. That is the entire point: every stage is a heuristic
and heuristics regress each other, so the blast radius of a change has to be
visible in one run.

**Lines starting with `~` are known gaps.** The expectation is what the parser
*should* produce, and it currently doesn't — and the test asserts it *still*
fails. This sounds perverse and is the most useful thing in the file: fixing a
gap breaks the build and tells you to promote it, instead of the corpus quietly
recording an improvement nobody noticed.

So: **a fixture that stops being broken means the parser got better.** That
happened three times in one session. The instinct is to assume the test is
wrong; check the other direction first.

### The invariants

`src/lib/invariants.ts` — eleven rules a shopping row must never violate
(`name-empty`, `name-holds-a-measurement`, `unit-without-amount`,
`row-redundant`, …). They're used in four places:

1. the corpus test, one line at a time — shortest distance to a cause
2. the aggregated-list test, over the whole corpus shopped at once
3. the benchmark, as a score with no house style in it
4. **the app itself** — a row that breaks a rule draws a flag, so Seymour
   notices a bad parse without being asked

They can't see a parse that is wrong but *tidy*: if `heavy cream` silently
became `cream`, every rule passes. That gap is what the "This is wrong" menu
item exists for. The two halves deliberately don't overlap.

`tests/shopping-invariants.test.ts` hands every rule the thing it exists to
catch, and a meta-test walks `ALL_RULE_IDS` to fail if a rule has no test that
fires it. **A checker that can't fail is worse than no checker** — it reports
green forever.

### The correction loop

A row's action menu has "This is wrong". The dialog takes the corrected fields
and writes a `Correction` (`src/lib/corrections.ts`), which
`parseIngredientLines` applies **before** anything else on the next parse. A
`line` correction beats a `name` correction; corrected names still go through
`normalizeIngredientName`, so a fix generalizes to plurals and synonyms.

Corrections are local by default. A per-correction **Share** toggle also inserts
into a shared `parser_reports` table (`supabase/schema.sql`), which is
**insert-own/select-own, never read by any client**. That's deliberate: an inbox
has no moderation problem and no consensus problem. It's a pool of real failures
to mine when writing the next batch of parser fixes; `asCorpusLine` formats one
straight into golden-corpus syntax.

The point of the whole loop: **everything the parser knows is a list someone
wrote down.** Corrections extend those lists from outside without a release.

### The benchmark

Not part of `npm run check`. It needs a 20 MB download and it isn't a pass/fail
gate — it's a measurement.

`npm run benchmark:fetch` pulls NYT's `ingredient-phrase-tagger` data (Apache
2.0, 178,000 hand-labelled lines) into gitignored `benchmark/data/`.
`npm run benchmark` scores **every** CSV/TSV/TXT in that directory — drop a file
in and it gets scored, no adapter to write.

Current numbers:

| field | score |
| --- | --- |
| quantity | 93.5% |
| unit | 92.0% |
| name | 70.7% |
| **satisfies our own invariants** | **98.2%** |
| ingredients our vocabulary doesn't recognize | 25.5% |

**The name figure is not an error rate, and chasing it will make the app
worse.** A large part of the gap is house style — NYT strips every descriptor
into a separate column, so their name for `1 medium-size onion, peeled and
chopped` is `onion`. The single most common word we keep and they drop is
`ground` (4,694 lines), and ground beef is not beef. Their labels aren't gospel
either: `1 lemon, thinly sliced` is tagged `lemon, thinly`.

The two honest metrics are:

- **the invariant score** — "does this row break rules we wrote ourselves" has
  no opinion about spelling in it
- **the novelty metric** — what share of a dataset's distinct names our
  vocabulary has never seen. It answers "is this dataset worth pulling in?" and
  it found real bugs: `-inch piece` and `-and-half` showed up as unrecognized
  *ingredients*, which is what a broken parse looks like from the outside.

The corpus and the benchmark answer different questions. The corpus answers
"did this change break something?" — it runs every build and every line is there
because someone hit it. It cannot answer "is the parser better than last week?",
because scoring against cases we picked ourselves mostly measures our
imagination. Run the benchmark, read the top disagreement shapes, fix one, add
the case to the corpus so it can never come back.

`npm run benchmark:harvest -- urls.txt` scrapes ingredient lines (and only
ingredient lines — no titles, instructions, images or URLs) from recipe pages
into `benchmark/data/harvested.txt`. It honours robots.txt, one request at a
time, and stops on a host after a 429 or 403. **It can't run in this sandbox**;
the proxy reaches almost nothing.

---

## Lessons that cost something

### Verify, don't reason

Every significant defect of the last session was found by probing the running
thing, not by reading the source. Reading source tells you what you meant.

- Item 5 was written on the premise that parenthetical amounts were broken.
  They weren't — a two-minute probe showed the real bug was the slash form. The
  document was wrong and the code was fine.
- The re-parse bug was jsonb key ordering. Confirmed by starting a real
  Postgres 16 and looking. (Postgres reorders object keys by length, then
  bytewise. Compare fields, not serialized forms.)
- The "Fixed in N recipes" confirmation never appeared, and every unit test
  passed. The row rendered it; a correction changes the row's name, which is
  part of its id, so it unmounted on the very render that would have shown it.
  Only a browser could see that.

If a fix is more than two lines of reasoning away from the evidence, get more
evidence.

### Decline to guess

A recurring judgement across the parser: when the reading is ambiguous, produce
the whole phrase rather than a confident wrong answer.

`chooseOption` returns `null` when it isn't sure which side of an "or" is the
ingredient. `truncateAtInstruction` won't cut at the first word, won't cut at
the last, and requires a connective after the verb. `1 cup water or chicken
broth` stays whole because neither reading is safe.

**A long name is honest. A row called "vegetable" is not.** You can read a long
row in the shop; you can't recover a wrong one.

### Other things that turned out to matter

- **`\b` is satisfied by a hyphen.** Spelled-out numbers turned `half-and-half`
  into `-and-half`. Use `(?:\s+|$)`.
- **Fixing a bug case-by-case is the wrong shape.** `fresh or frozen
  blueberries` → `or frozen blueberry` got fixed generally in `stripAffixes`,
  which then also fixed things nobody had reported.
- **Throwing away something you needed to buy is worse than an ugly row.** The
  drop filter only removes lines that name *nothing* — a bare `of`, a bare
  amount.
- **`0.7` alpha is the AA floor on this palette.** `tests/palette.test.ts` pins
  it and greps `src/` for `text-*/60` and below. Verified to fire by putting a
  `/60` back.

---

## Environment traps

- **`pkill -f "next dev"` kills the shell** (exit 144) — the pattern matches the
  heredoc running it. Use a different port instead of killing anything.
- **Playwright**: Chromium is pre-installed under `/opt/pw-browsers`. Never run
  `playwright install`. `@axe-core/playwright` needs `browser.newContext()`,
  not `newPage()` directly.
- **`npm run e2e` fails outright in this sandbox**, and it is not your change.
  The pre-installed browsers are build `1194`; `@playwright/test` 1.61 asks for
  `1228` and for `chrome-headless-shell`, which isn't there at all — every test
  dies with "Executable doesn't exist". Run the suite against the build that is
  installed, with a throwaway config you do **not** commit:

  ```ts
  // playwright.local.ts — delete before committing
  import base from './playwright.config';
  export default { ...base, projects: [{ name: 'chromium', use: {
    ...base.projects![0].use,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  } }] };
  ```

  `npx playwright test -c playwright.local.ts` — all 99 pass that way. CI has
  matching browsers, so don't "fix" the committed config.
- **The dev server caches stale bundles after a `git mv`.** If a rename produces
  impossible errors, restart it.
- **The outbound proxy blocks nearly every host.** It reaches
  `raw.githubusercontent.com` and little else. When something is blocked,
  **report the blocked host — never retry it or route around it.**
- **The git proxy 403s on ref deletion.** Remote branches have to be deleted
  from the GitHub UI.
- A script that's also imported needs an entry-point guard:
  `import.meta.url === pathToFileURL(process.argv[1]).href`. Without it,
  importing `harvest.ts` runs `main()` and exits the test runner.

## Security constraints

These are not negotiable and not summarizable.

- **`.env.local` is gitignored** (`.env` and `.env*.local`) and is the only
  place live credentials go. It currently holds `KV_REST_API_URL`,
  `KV_REST_API_TOKEN`, and `SPOONACULAR_API_KEY`.
- **Never commit a credential, and never echo one into a commit message, a PR
  body, or a test.** Not even redacted, not even as an example.
- The Supabase anon key is safe in `NEXT_PUBLIC_*` — every table's RLS policy
  restricts it to `auth.uid()`. That is the only reason it's safe, so **never
  add a table without an RLS policy.**

---

## Where things stand

`main` is at `addd1a2`. 425 unit tests, all passing. All ten items of
`docs/shopping-parser.md` shipped.

**Waiting on the user, not on code:**

- **Re-run `supabase/schema.sql`** in the Supabase SQL editor. It adds
  `parser_reports`; without it the Share toggle fails quietly. Safe to re-run —
  everything is `if not exists`.
- **Settings → Ingredient lines → Re-read ingredients.** Parser improvements
  only reach recipes you already saved through that button.
- A stale remote branch `fix/dashboard-meal-keys` needs deleting from the GitHub
  UI.

**Deliberately not built:**

- Spoonacular `aisle` plumbing beyond what `/api/discover` already returns.
- A Spoonacular harvester for diverse labelled data — it would spend the user's
  API quota, so it wants their nod first.

**Good next moves**, roughly in order of value per hour:

1. Run the benchmark, take the top disagreement shape, fix it, add the case to
   the corpus. That loop has produced every parser gain so far. The last pass
   took the yield clause ("2 sprigs oregano to yield 1 tablespoon chopped",
   276 lines). The biggest remaining shape under `name-holds-a-measurement` is
   a *second ingredient* joined to the first — "1 egg yolk beaten with 1
   teaspoon cold water", "1/4 pound butter cut into 12 slices" — where the
   whole clause stays in the name. Note this is a harder call than the yield
   clause: the second ingredient is often something you genuinely have to buy,
   so cutting is not obviously right and splitting may be the better shape.
2. Promote `~1 cup sugar plus 2 tbsp butter` — a `plus` *after* the name still
   leaves the second amount in the name. It's the only remaining known gap.
3. Mine `parser_reports` once real corrections accumulate; `asCorpusLine`
   already formats them for the corpus.
