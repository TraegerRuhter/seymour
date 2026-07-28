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
| 4 | **A golden corpus** — real scraped lines, expected output, one file | M | High | **shipped** |
| 5 | **Metric echoes** — "1 cup (240 ml) milk" should not become two rows | S | Med | **shipped** |
| 6 | **Alternatives** — "butter or margarine", "2 cups milk or cream" | M | Med | **shipped** |
| 7 | **Instruction lines** — detect and quarantine, don't silently shop for them | M | Med | **shipped** |
| 8 | **Descriptor vs identity** — when is "heavy cream" just "cream"? | M | Med | not started |
| 9 | **Regional and non-metric units** — kilo, sachet, pack, bunch, tali | S | Med | **shipped** |
| 10 | **Output invariants** — assertions the aggregated list must always satisfy | S | High | **shipped** |

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

### 4. A golden corpus — shipped

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

Shipped as `tests/fixtures/ingredient-lines.tsv` plus
`tests/ingredient-corpus.test.ts`. Lines marked `~` are known gaps, and the
test asserts they are *still* gaps — so fixing one fails the run and tells you
to promote it, rather than the corpus quietly recording an improvement nobody
noticed. Items 6, 7, 8 and 9 all have their cases waiting in there already.

It earned its keep immediately: it caught that `oil for frying` kept "for
frying" in the name *and* showed it in the amount column, because the parser's
qualifier list and normalize.ts's suffix list had drifted apart. They're one
list now.

---

### 5. Metric echoes — shipped

`1 cup (240 ml) milk` and `2 lb (900 g) beef` are one ingredient stated twice.

The parenthesised half turned out never to have been broken: the paren branch
discards its contents outright, so the conversion was already being dropped
rather than doubled. Probing before changing anything is what showed this —
both forms were already settled cases in the corpus.

What *was* broken is the same restatement written without parentheses, which
the paren branch never sees:

```
"2 lb / 900 g beef"   →  name: "/ 900 g beef"
"2 lb or 900 g beef"  →  name: "or 900 g beef"
```

Neither is a shopping row for anything.

Shipped as `eatEcho` in `ingredient-parser.ts`, using the rule this section
always specified: after a separator (`/`, `|`, ` or `), if what follows parses
as quantity + unit **and that unit is in a different measurement system to the
one already found**, discard it.

The different-system guard is what keeps this off item 6's territory. `2 cups
milk or cream` has no amount on the far side; `1 lb chicken thighs or 2 lb
beef` has one, but in the same system — so it's a choice, not a conversion, and
both are left exactly as they were.

`unitSystem()` in `units.ts` is the new predicate: metric, imperial, or `null`
for counts like cans and bunches, which belong to neither and so can never look
like a conversion.

---

### 6. Alternatives — shipped

`butter or margarine`, `2 cups milk or cream`, `cilantro (or parsley)`.

These were a single row named `butter or margarine`, which is a shopping item
that doesn't exist. The first option is now the name and the remainder becomes
a note.

Two forms, because the parenthesised one has to be caught *before*
`normalizeIngredientName` runs — that drops parentheticals wholesale and would
take the alternative with them.

The risk was always the reverse of the bug: an ingredient whose real name
contains those two letters. Splitting on whitespace-delimited ` or ` is what
makes it safe, and `orange`, `orzo`, `oregano`, `cornmeal`, `chorizo` and
`coriander` are all in the corpus proving it.

Nothing is hidden by this. The full line is rendered verbatim on the recipe
page, in cook mode, and in the shopping list's "why this many" breakdown — only
the row's *name* changes.

`and` is untouched. Two ingredients on one line is a different change and is
still a known gap.

---

### 7. Instruction lines — shipped

`1 tablespoon of all purpose flour dissolve in 1/4 cup water` is not an
ingredient. Neither is `Preheat oven to 350°F`, which some sites put in the
ingredient block.

Shipped as `truncateAtInstruction`, and it is as timid as this section asked
for. Two conditions, both about refusing to guess:

- **Not the first word.** Nothing before the verb means nothing to keep, so
  `Preheat oven to 350°F` is left exactly as it is. An ugly row is recoverable;
  a missing one isn't.
- **Not the last word.** A trailing verb is far more likely a noun —
  `cake mix`, `pancake mix` — than an instruction with nothing after it.

The truncated half becomes a note, and `originalString` still holds the whole
line, so nothing is destroyed.

The verb list is deliberately short and deliberately excludes every prep word.
`chopped`, `crushed`, `ground`, `whipped`, `sweetened`, `shredded` and friends
are descriptors sitting in front of a noun — `frozen chopped spinach` — and
normalize.ts already handles them. Cutting at one would take the ingredient
with it. That case is in the corpus, along with `whipping cream`, `cooking
oil`, `cooked rice` and `sweetened condensed milk`.

The word-count and second-measurement signals this section also proposed went
unused. The verb alone covered every case in the corpus, and each extra signal
is another way to delete something you needed to buy.

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

### 9. Regional and non-metric units — shipped

The list in the screenshot was a Filipino recipe — `calamansi`, `catsup`,
`gravy`. Units follow the same pattern: `kilo`, `1/2 kilo`, `sachet`, `pack`,
`bundle`, `tali`, `dozen`.

Mostly data entry into `UNIT_ALIASES`. What went in:

| written | canonical | why |
|---|---|---|
| `kilo`, `kilos` | `kg` | the common spelling outside a lab |
| `tin`, `tins` | `can` | the same object; two rows for it was the bug |
| `pack`, `packs`, `packet`, `packets` | `package` | only `package`/`pkg` were there |
| `bundle`, `bundles`, `tali` | `bunch` | a tied bundle of greens is a bunch |
| `sachet`, `sachets` | `sachet` | *not* a package — a single-use portion |
| `bottle`, `bag`, `box`, `carton`, `dozen` | themselves | how a shop sells it |

Merging the spellings is the point: `1 tin chopped tomatoes` and `2 cans of
tomatoes` now make three cans on one line instead of two lines.

Deliberately left out: `leaf`/`leaves`, `cube`, `strip`, `fillet`, `bar`. Every
alias is a word the parser will now eat, and each of these turns a real name
into a worse one — `2 bay leaves` would become two of "bay".

`sprig` plurals were already there. The units the shopping list can *convert*
are unchanged; everything added here is a count, which sums with its own kind
and nothing else.

---

### 10. Output invariants — shipped

Cheap, and catches whole classes of regression from the other nine. The rules
live in `tests/invariants.ts` — not a test file, so the corpus test and the
aggregated-list test can share one definition instead of drifting apart the way
the qualifier list did.

| rule | a row must never |
|---|---|
| `name-empty` | have no name |
| `name-fragment` | start with `of`, `a`, `an`, `and`, `or`, `to`, `for`, `with` |
| `name-is-a-unit` | be nothing but a unit word |
| `name-holds-a-measurement` | contain a number followed by a known unit |
| `name-too-long` | run past 6 words |
| `quantity-finite` / `quantity-negative` | have a quantity that isn't a real, non-negative number |
| `unit-unknown` | be measured in something the alias table doesn't know |
| `unit-without-amount` | show a unit with no number in front of it |
| `qualifier-with-amount` | carry "to taste" *and* a real amount |
| `id-duplicated` | share an id with another row (ids carry the checked flag) |
| `row-redundant` | appear unmeasured when the same name is already on the list with an amount |

Applied three ways: to every settled corpus line at parse time, to each line
aggregated on its own, and to the whole corpus aggregated as one shop. Known
gaps are held only to the structural rules — a line already recorded as parsing
wrongly would otherwise just fail twice.

A checker that can't fail is worse than no checker, so every rule has a test
that hands it the thing it exists to catch, and a final test walks the rule ids
and fails if any of them was never triggered.

**It found something on its first run.** A scraper leaving a bare `of` or `or`
on its own row produced a shopping row named "of". `parseIngredientLines` now
drops a line whose entire parsed name is a joining word — whole name only, so
anything with an ingredient attached is kept however badly it parsed. Throwing
away something you needed to buy is the worse mistake.

---

## 4. Does any of this reach recipes I already have?

Not on its own. Parsing happens once, when a recipe is imported or saved, and
the parsed fields are stored on the recipe — the shopping list is built from
those, not from the original text. So a parser improvement does nothing for a
collection that already exists.

It can be made to, because `originalString` is kept verbatim on every
ingredient: the raw line is always still there to re-read. **Settings →
Ingredient lines → Re-read ingredients** does exactly that, reports how many
recipes actually changed, and is idempotent. Original lines are never
rewritten.

Worth pressing after any of the remaining items ships.

---

## 5. Not in this document

The **layout** half of the shopping list — row spacing, the amount column,
where the aisle rules sit — is a separate piece of work and isn't covered
here. Item 3 overlaps it (the blank cell), but the rest of the readability
pass stands on its own.
