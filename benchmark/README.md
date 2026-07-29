# Benchmark

Scores the ingredient parser against 178,000 hand-labelled lines.

```
npm run benchmark:fetch          once — downloads ~20 MB into benchmark/data/
npm run benchmark                scores every file in benchmark/data/
npm run benchmark -- --source nyt --limit 5000 --samples 5
```

## Adding your own data

**Drop any CSV, TSV or `.txt` into `benchmark/data/` and it gets scored.** No
adapter to write, no config: the header row is matched against a list of
plausible column names (`input`/`line`/`ingredient`, `name`/`food`,
`qty`/`quantity`/`amount`, `unit`/`units`/`measure`), and a file with no
recognisable line column is read as one ingredient per line.

That last case matters more than it sounds. **Unlabelled data is still worth
having**, because the invariants don't need an answer key to say a row is
broken. A file of ten Filipino adobo lines found `pcs` — twice in ten lines,
and NYT's 178,000 American ones contain none of it.

### Harvesting your own

```
npm run benchmark:harvest -- urls.txt          # one URL per line
npm run benchmark:harvest -- urls.txt --delay 2000 --max 200
```

Fetches recipe pages, pulls their ingredient lines out with the same schema.org
reader the app's URL import uses, and appends them to
`benchmark/data/harvested.txt` for `npm run benchmark` to pick up.

**It keeps ingredient lines and nothing else** — no titles, instructions,
images or URLs. That's everything a parser benchmark needs and nothing that
amounts to warehousing someone's recipe.

It tries to be a polite guest: robots.txt fetched once per host and honoured,
one request at a time with a delay between them, a 429 or 403 stops that host
for the rest of the run, and already-fetched URLs are skipped so re-running
resumes instead of re-fetching. The robots.txt reader ignores `Allow`
overrides and wildcards, which makes it stricter than the standard rather than
looser — erring toward not fetching is the right way to be wrong.

**It can't run in the Claude Code sandbox**, whose proxy reaches
raw.githubusercontent.com and little else. Run it somewhere with ordinary
network access.

### Or download something bigger

Datasets worth a look, none of which this sandbox can reach either:

| | licence | why |
|---|---|---|
| [Open Food Facts](https://world.openfoodfacts.org/data) | **ODbL** — share-alike applies to derived databases, so read it before shipping a keyword list built from it | ~3M international products with categories; the best fit for our two weakest hand-written tables |
| [USDA FoodData Central](https://fdc.nal.usda.gov/download-datasets.html) | public domain | cleanest licence there is; US-centric but a canonical ingredient vocabulary |
| [RecipeNLG](https://recipenlg.cs.put.poznan.pl/) | non-commercial research | 2.2M recipes with extracted ingredient names |
| [Food.com on Kaggle](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions) | varies | 230k recipes |

Never part of `npm run check`. It needs a download and it isn't a pass/fail
gate — it's a measurement.

## Why this exists alongside the golden corpus

`tests/fixtures/ingredient-lines.tsv` answers **"did this change break
something?"** It runs on every build, it's small enough to read, and every line
in it is there because someone hit that case.

It cannot answer **"is the parser better than it was last week?"** — it only
holds about 110 cases, all chosen by whoever was fixing a bug at the time.
Scoring against cases we picked ourselves mostly measures our imagination.

This answers the second question, and prints the biggest disagreement patterns
so the answer arrives with a to-do list rather than just a number.

The two are meant to feed each other: run the benchmark, look at the top
patterns, fix one, add the case to the golden corpus so it can never come back.

## Source and attribution

The New York Times' own ingredient parser training data, from
[NYTimes/ingredient-phrase-tagger](https://github.com/NYTimes/ingredient-phrase-tagger)
— 178,000 lines tagged by hand by news assistants, published under the Apache
License 2.0 alongside the CRF model they trained on it.

    Copyright (c) 2016 The New York Times Company
    Licensed under the Apache License, Version 2.0

The file is **not committed**. It's fetched on demand into `benchmark/data/`,
which is gitignored — 20 MB of third-party data doesn't belong in a repo whose
test fixtures are meant to be read by a person.

## Reading the score

Both sides go through *our* normalizer before comparison. That's the fair
question — did we extract the same ingredient, not did we spell it their way.
Without it a completely correct parser would score near zero, because they tag
`carrots` where we say `carrot` and `tablespoon` where we say `tbsp`.

**The name figure is not an error rate.** A large part of the gap is house
style: NYT strips every descriptor into a separate `comment` column, so their
name for `1 medium-size onion, peeled and chopped` is just `onion`. Some of
that we want; some of it we deliberately don't. The disagreement *shapes* are
what separate the two — "we kept extra words" points at our descriptor rules,
"we dropped words they kept" is usually their labelling noise.

Their labels are not gospel either. `1 lemon, thinly sliced` is tagged with the
name `lemon, thinly`, which is nobody's ingredient.

## Baseline

First run, at `f6061d2` plus the corrections engine — all ten items of
`docs/shopping-parser.md` shipped:

| field | first run | after the first pass of fixes |
|---|---|---|
| quantity | 93.0% | 93.5% |
| unit | 91.8% | 92.0% |
| name | 69.5% | 70.6% |
| all three | 63.3% | 63.6% |
| **satisfies our own invariants** | 97.3% | **98.1%** |

The last row is the one worth watching. Agreement with NYT is partly a
measure of whose house style you prefer; "does this row break the rules we
wrote ourselves" has no opinion in it at all, and it moved 0.8 points.

Summing compound amounts costs a little agreement on purpose: `2 tablespoons
plus 2 teaspoons baking powder` is now 2.6667 tbsp where NYT records 2. Summing
is right for a shopping list and wrong for their display formatting.

What that first run surfaced, in order of how often it happens:

1. **Descriptors joined by "and"** — `peeled and cooked fresh chestnuts` keeps
   the whole phrase. Our stripper only takes known prefixes one at a time and
   stops at the `and`. Biggest single bucket by a distance.
2. **`2 28-ounce cans crushed tomatoes`** — a size stated without parentheses.
   ~800 lines. We keep `28-ounce cans` in the name; they resolve it to 56 oz.
3. **`Scant 1/2 cup sugar`** — a hedge word we don't know, so the whole line
   stays as the name.
4. **A line that is only an amount** — `1 teaspoon` alone comes out named
   `1 teaspoon`, digit and all.

Note that (2) and (3) are exactly the class of thing the golden corpus could
never have found on its own: nobody hit them, so nobody wrote them down.
