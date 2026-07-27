# Fine-tuning the ingredient parser

Ten things that would make the shopping list robust, roughly in the order
they're worth doing. The table is the tracker; the sections below it are the
detail. Same shape as `design-prospectus.md` — pick one off, tick it, move on.

---

## 1. What's actually wrong

The parser is better than it looks. Most of the obvious forms already work:

| line | quantity | unit | name |
|---|---|---|---|
| `1 teaspoon of salt` | 1 | tsp | salt |
| `¼ teaspoon of salt` | 0.25 | tsp | salt |
| `3 cloves of garlic` | 3 | clove | garlic |
| `2 garlic cloves` | 2 | clove | garlic |
| `1-2 onions` | 1.5 | — | onion |
| `juice of 1 lemon` | 0 | — | lemon juice |

So the failures aren't "the parser is naive". They're specific, and they fall
into three groups.

**Group A — it drops a word it should have eaten.** One confirmed defect,
reproduced:

```
"2 (14 oz) cans of tomatoes"   →  name: "of tomato"
"1 (15 oz) can of black beans" →  name: "of black bean"
```

`of` is stripped *before* the parenthetical branch runs
(`ingredient-parser.ts`, the `quantity > 0` block). That branch then consumes
`(14 oz)` and the `cans` after it, exposing a fresh `of` that nothing strips
again. This is where the `of salt` in the screenshot came from.

**Group B — it can't eat a word because there's no number in front of it.**
The entire quantity/unit/filler pass is inside `if (quantity > 0)`. Any line
that doesn't open with a digit keeps every word:

```
"Pinch of salt"      →  name: "pinch of salt"
"A pinch of salt"    →  name: "a pinch of salt"
"cup of salt"        →  name: "cup of salt"
"some salt"          →  name: "some salt"
```

Each of these is a separate row in the shopping list from plain `salt`.

**Group C — the line was never an ingredient to begin with.** Recipe sites
put instructions in the ingredient array all the time:

```
"1 tablespoon of all purpose flour dissolve in 1/4 cup water"
    →  name: "all purpose flour dissolve in 1/4 cup water"
```

The parser did its job here. The line is the problem.

There's also a fourth thing that isn't a parser bug at all: an ingredient with
no quantity renders as a blank cell in the ledger, which reads as *broken*
rather than as *no amount given*. That's a display decision, and it's item 3.

---

## 2. The ten

| # | Change | Size | Impact | Status |
|---|---|---|---|---|
| 1 | **Re-strip filler after the parenthetical** — the confirmed `of tomato` bug | S | High | **shipped** |
| 2 | **Parse quantity-less lines too** — "Pinch of salt", "a handful of parsley" | S | High | **shipped** |
| 3 | **Say "to taste" instead of leaving the cell blank** | S | High | **shipped** |
| 4 | **A golden corpus** — real scraped lines, expected output, one file | M | High | not started |
| 5 | **Metric echoes** — "1 cup (240 ml) milk" should not become two rows | S | Med | not started |
| 6 | **Alternatives** — "butter or margarine", "2 cups milk or cream" | M | Med | not started |
| 7 | **Instruction lines** — detect and quarantine, don't silently shop for them | M | Med | not started |
| 8 | **Descriptor vs identity** — when is "heavy cream" just "cream"? | M | Med | not started |
| 9 | **Regional and non-metric units** — kilo, sachet, pack, bunch, tali | S | Med | not started |
| 10 | **Output invariants** — assertions the aggregated list must always satisfy | S | High | not started |

---

## 3. The detail

### 1. Re-strip filler after the parenthetical — shipped

The one confirmed defect. `of` is removed once, too early, and the
parenthetical branch can expose another one.

The narrow fix is to strip filler again after the paren branch. The better fix
is to stop treating it as a one-shot: make a small `eatFiller(rest)` helper and
call it after *every* consumption step — after the quantity, after the unit,
after the parenthetical, after the inner unit. Filler is not a thing that
appears in exactly one position.

Worth widening the filler set at the same time: `of`, `of the`, `about`,
`approx`, `roughly`, `around`. All of them appear in scraped lines and none of
them is part of an ingredient's name.

**How we'd know:** the three lines in Group A above, as fixtures.

---

### 2. Parse quantity-less lines too — shipped

`if (quantity > 0)` gates everything. That's the wrong gate — a line can name a
unit without a number (`Pinch of salt`) and it can open with an article
(`A pinch of salt`).

Two changes:

- **Treat a leading article as a quantity of one.** `a` / `an` before a unit
  word or an ingredient means one of it. `A pinch of salt` → `1 pinch salt`.
  Careful: only when followed by a unit or a countable noun, or `a` in
  `a la` and similar breaks.
- **Allow a leading unit with no number.** `Pinch of salt`, `Cup of rice`,
  `Handful of parsley`. Quantity stays 0 (we genuinely don't know how many),
  but the unit is recorded and the name is clean, so it buckets with other
  salt.

This is the change most likely to visibly shrink a messy list, because every
one of these currently forms its own row.

**Risk:** over-eager article stripping on names that legitimately start with a
short word. Mitigated by requiring what follows to be a known unit or by
keeping a small stop-list.

---

### 3. Say "to taste" instead of leaving the cell blank — shipped

Not a parser change — a display one, and the thing that made the list look
wrong in the first place.

Right now `salt to taste` parses to `{ quantity: 0, name: "salt" }` and the
phrase `to taste` is **thrown away**. The ledger then renders an empty amount
column next to `salt`, which reads as a parse failure rather than as "as much
as you like".

Proposal: keep the qualifier. Add an optional `qualifier?: 'to taste' | 'as
needed' | 'for serving' | 'for garnish'` to `Ingredient`, set it when the line
says so, and render it in the amount column in the muted style — right where
the number would have been.

For items with genuinely no amount and no qualifier, render an em dash rather
than nothing, so the column always has something in it and the row doesn't look
truncated.

**How we'd know:** `salt to taste`, `pepper, to taste`, `oil for frying`,
`parsley for garnish` all render with a legible amount cell.

---

### 4. A golden corpus

Every other item on this list is a heuristic change, and heuristics regress
each other. There is currently no corpus — the unit tests cover cases someone
thought of while writing the code.

Proposal: `tests/fixtures/ingredient-lines.txt`, a few hundred real lines
pulled from actually-scraped recipes (the collection already has some, and the
Discover import produces more), each with its expected parse. One test walks
the file. Adding a line is one line.

This is the item that makes the other nine safe to attempt, which is why it's
high impact despite fixing nothing on its own. It's worth doing before 6, 7 and
8 rather than after.

**Bonus:** it doubles as a benchmark. "87% of lines parse to a clean name" is a
number that can go up.

---

### 5. Metric echoes

`1 cup (240 ml) milk` and `2 lb (900 g) beef` are one ingredient stated twice.
The parenthetical branch already handles `1 (15 oz) can` — a *size* — but a
parenthetical that's a straight conversion of the quantity just before it is a
different thing and should be dropped, not read.

Rule: if the parenthetical parses as quantity + unit, and that unit is a
different measurement system to the one already found, discard it.

**Risk:** low. The failure mode today is a silently doubled amount when the
paren value gets picked up.

---

### 6. Alternatives

`butter or margarine`, `2 cups milk or cream`, `cilantro (or parsley)`.

Today these become a single row named `butter or margarine`, which is a
shopping item that doesn't exist. Proposal: split at ` or `, take the first as
the name, keep the remainder as a note, and show it in the row's "why this
many?" detail so the choice isn't lost.

**Risk:** ingredients with `or` in their actual name are rare but exist. The
corpus (4) is what makes this checkable.

---

### 7. Instruction lines

`1 tablespoon of all purpose flour dissolve in 1/4 cup water` is not an
ingredient. Neither is `Preheat oven to 350°F`, which some sites put in the
ingredient block.

Detecting these reliably is hard, and getting it wrong deletes something you
needed to buy. So the proposal is deliberately timid:

- Detect the *signals* — an imperative verb (`dissolve`, `preheat`, `combine`,
  `whisk`) appearing after the ingredient name, a second measurement mid-line,
  more than ~8 words.
- **Truncate at the verb rather than dropping the line.** `all purpose flour
  dissolve in 1/4 cup water` → `all purpose flour`, with the full original kept
  (it already is — `originalString` is preserved verbatim).
- Never drop a line entirely without showing it somewhere.

**Risk:** the highest on this list. Do 4 first.

---

### 8. Descriptor vs identity

`normalize.ts` already strips prep words. The open question is where the line
sits, and it's genuinely a judgement call per word:

- `freshly ground black pepper` → `black pepper`. Right.
- `boneless skinless chicken thighs` → `chicken thighs`. Right — you buy them
  as one thing.
- `heavy cream` → `cream`. **Wrong.** Different product.
- `black pepper` → `pepper`. **Wrong.** Different product from white pepper.
- `large eggs` → `eggs`. Right, arguably — most people don't sort by size.

So this isn't one rule, it's a vocabulary: a list of words that are *always*
descriptors (`freshly`, `finely`, `roughly`, `organic`), a list that are
*never* (`heavy`, `double`, `black`, `white`, `smoked`), and a default for
everything else. The corpus decides the default.

Worth doing carefully because over-normalizing is invisible: two things merge
into one row and you buy the wrong item.

---

### 9. Regional and non-metric units

The list in the screenshot was a Filipino recipe — `calamansi`, `catsup`,
`gravy`. Units follow the same pattern: `kilo`, `1/2 kilo`, `sachet`, `pack`,
`bundle`, `tali`, `dozen`.

`units.ts` has a good alias table; this is mostly data entry. `kilo`/`kilos`
→ `kg` is a one-line addition that would already help.

Also worth adding: `pack`/`packet` (only `package`/`pkg` are there today),
`tin`, `jar` sizes, `bottle`, `sprig` plurals.

---

### 10. Output invariants

Cheap, and catches whole classes of regression from the other nine. A test
over the *aggregated* list asserting things that must never be true:

- No name starts with `of`, `a`, `an`, `and`, `or`, `to`, `for`, `with`.
- No name is empty, or is only a unit word.
- No name contains a digit followed by a unit (a second measurement leaked in).
- No name is longer than ~6 words.
- Every unit is in the known alias table.
- Quantity is finite and ≥ 0.

Run it over the corpus from 4 and it becomes a genuine safety net rather than
six assertions about one example.

---

## 4. Not in this document

The **layout** half of the shopping list — row spacing, the amount column,
where the aisle rules sit — is a separate piece of work and isn't covered
here. Item 3 overlaps it (the blank cell), but the rest of the readability
pass stands on its own.
