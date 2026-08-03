# The ingredient parser — what was built, and why

This started as a plan: ten changes that would make the shopping list robust,
in the order they were worth doing. All ten shipped, so it is a record now
rather than a tracker.

[`CLAUDE.md`](../CLAUDE.md) has the working detail — the stage list, the corpus,
how to add a case. This has the reasoning: what was actually wrong, and the
judgement calls that are worth not re-litigating.

---

## 1. What was wrong

The parser was better than it looked. Most obvious forms already worked —
`1 teaspoon of salt`, `¼ teaspoon of salt`, `3 cloves of garlic`,
`2 garlic cloves`, `1-2 onions`, `juice of 1 lemon`. So the failures weren't
"the parser is naive". They were specific, and they fell into three groups.

**Group A — it dropped a word it should have eaten.** One confirmed defect:

```
"2 (14 oz) cans of tomatoes"   →  name: "of tomato"
"1 (15 oz) can of black beans" →  name: "of black bean"
```

`of` was stripped once, too early; the parenthetical branch then consumed
`(14 oz)` and the `cans` after it, exposing a fresh `of` that nothing stripped
again.

**Group B — it couldn't eat a word because there was no number in front of
it.** The whole quantity/unit/filler pass sat inside `if (quantity > 0)`, so
any line not opening with a digit kept every word:

```
"Pinch of salt"   →  name: "pinch of salt"
"some salt"       →  name: "some salt"
```

Each of those was a separate shopping row from plain `salt`.

**Group C — the line was never an ingredient.** Recipe sites put instructions
in the ingredient array all the time:

```
"1 tablespoon of all purpose flour dissolve in 1/4 cup water"
```

The parser did its job there. The line was the problem.

And a fourth thing that was never a parser bug: an ingredient with no quantity
rendered as a blank cell, which reads as *broken* rather than as *no amount
given*. That was a display decision.

---

## 2. The ten, as shipped

| # | Change | Where it lives |
|---|---|---|
| 1 | Re-strip filler after the parenthetical — the `of tomato` bug | `eatFiller`, called after *every* consumption step |
| 2 | Parse quantity-less lines too — "Pinch of salt", "a handful of parsley" | `readBareUnit`, `ARTICLE_REGEX`, `VAGUE_REGEX` |
| 3 | Say "to taste" rather than leaving the cell blank | `qualifier` on `Ingredient`, rendered in the amount column |
| 4 | A golden corpus — real lines, expected output, one file | `tests/fixtures/ingredient-lines.tsv` |
| 5 | Metric echoes — "2 lb / 900 g beef" is one ingredient stated twice | `eatEcho`, `unitSystem()` |
| 6 | Alternatives — "butter or margarine" is not a product | `readAlternative`, `chooseOption` |
| 7 | Instruction lines — quarantine, don't silently shop for them | `truncateAtInstruction` |
| 8 | Descriptor vs identity — when is "heavy cream" just "cream"? | `IDENTITY_MODIFIERS`, `NEVER_DROPPABLE` |
| 9 | Regional and non-metric units — kilo, sachet, pack, bunch, tali | `UNIT_ALIASES` |
| 10 | Output invariants — rules the list must always satisfy | `src/lib/invariants.ts` |

---

## 3. The decisions worth keeping

### Probing first changed what got built

Two of the ten turned out to be wrong about their own premise, and only
checking the running parser showed it.

Item 5 assumed parenthesised amounts were broken. They weren't — the paren
branch discards its contents outright, so the conversion was already dropped
rather than doubled. The real bug was the *slash* form, which that branch never
sees. Item 8 assumed the descriptor rules were over-merging; its own worst
cases (`heavy cream`, `black pepper`, `smoked paprika`, `wild rice`) were
already correct, and the four genuine over-merges were different words
entirely.

### Decline to guess

The recurring judgement, and the one most likely to be undone by someone trying
to be helpful. When the reading is ambiguous, produce the whole phrase rather
than a confident wrong answer.

`chooseOption` returns `null` when it can't tell which side of an "or" is the
ingredient — `butter or olive oil` is two things, `olive or vegetable oil` is
one thing twice, and no structural rule separates them.
`truncateAtInstruction` won't cut at the first word, won't cut at the last, and
requires a connective after the verb.

**A long name is honest. A row called "vegetable" is not.** You can read a long
row in the shop; you can't recover a wrong one.

The same reasoning is why `and` was left alone for a long time: two ingredients
on one line is a different change from choosing between two.

### A vocabulary, not a rule

Item 8's answer was `IDENTITY_MODIFIERS` — keyed by the prefix, listing the
heads it must *not* be taken off. `raw sugar` is demerara; `raw shrimp` is
still shrimp. `fresh mozzarella` is a different aisle from low-moisture;
`fresh spinach` is still spinach.

There is no rule there, only a list, because whether a word describes a thing
or names a different thing depends entirely on what follows it.

The more valuable half is `NEVER_DROPPABLE`: seventeen words that separate two
things you can buy, pinned by a test. Adding one of them to `DROPPABLE_PREFIXES`
later would be a one-line change with a silently wrong result — two rows merge
and the list is confidently incorrect. Now it fails the build instead.

**Over-merging is the failure that matters.** Two extra rows are a nuisance;
the wrong product in the basket isn't.

### What was deliberately left out

Every unit alias is a word the parser will now eat, so item 9 stopped short of
`leaf`/`leaves`, `cube`, `strip`, `fillet` and `bar`. Each turns a real name
into a worse one — `2 bay leaves` would have become two of "bay".

Item 7's verb list excludes every prep word. `chopped`, `crushed`, `ground`,
`whipped`, `shredded` are descriptors sitting in front of a noun — `frozen
chopped spinach` — and cutting at one would take the ingredient with it. The
word-count and second-measurement signals the plan also proposed went unused:
the verb alone covered every case, and each extra signal is another way to
delete something you needed to buy.

### A checker that can't fail is worse than no checker

Every invariant has a test that hands it the thing it exists to catch, and a
meta-test walks the rule ids and fails if any was never triggered. Otherwise it
reports green forever.

The invariants found something on their first run: a scraper leaving a bare
`of` on its own row produced a shopping row named "of". `parseIngredientLines`
now drops a line whose entire parsed name is a joining word — whole name only,
so anything with an ingredient attached is kept however badly it parsed.

---

## 4. Reaching recipes you already have

Parsing happens once, when a recipe is imported or saved, and the parsed fields
are stored on the recipe. So a parser improvement does nothing for a collection
that already exists.

It can be made to, because `originalString` is kept verbatim on every
ingredient. **Settings → Ingredient lines → Re-read ingredients** re-reads them,
reports how many recipes actually changed, and is idempotent. Original lines are
never rewritten.

Worth pressing after any parser change ships.

---

## 5. Not covered here

The **layout** half of the shopping list — row spacing, the amount column,
where the aisle rules sit — is separate work. Item 3 overlapped it; the rest of
the readability pass stands on its own.
