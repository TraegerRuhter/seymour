# Seymour — the design, and why it looks like this

**On why it once felt like a calculator, and what was done about it.**

Written July 2026 after a full read of the codebase, as a set of proposals.
Everything proposed has since shipped, so this is the record: the diagnosis,
the direction that was chosen over two others, and the refusals — which are
still live and are the part most worth reading before changing anything visual.

---

## 1. The diagnosis, in three layers

The complaint — "it's functional but there's no sauce" — was accurate, and it
separated into three layers, because only the first is the one people usually
argue about.

### Layer 1: the surface

The palette was warm cream (`#FAF7F2`) + terracotta (`#E07A5F`) + Inter +
`rounded-2xl` + glassmorphism.

That is not *a* generic look. It is close to *the* generic look — the first
item on Anthropic's own list of AI-design clichés to avoid is, near-verbatim,
"warm cream with a serif display and terracotta accent". It also names "Inter
as the safe face", "`rounded-lg` everywhere", and "accent bar on rounded
cards". Seymour hit four for four.

Not a failure of taste — it's what happens when a palette gets chosen by asking
for "warm and inviting". The statistical centre of the training data *is* warm
cream and terracotta.

### Layer 2: the architecture

Every screen was the same shape: an `<h1>`, a muted subtitle, then sections of
glass cards in a responsive grid. Five destinations, one skeleton. No screen
had earned its own layout logic, so nothing felt like a *place* — it felt like
five views onto the same table. That is why it read as "an admin panel for
recipes" rather than "a kitchen".

### Layer 3: the behaviour

The one that actually explained "it feels like a calculator".

- **Nothing accumulated.** No record that you ever *cooked* anything. Recipe #1
  and recipe #200 were identical objects with identical histories: none.
- **Nothing improved with use.** Day 400 behaved exactly like day 1, with more
  rows.
- **The app never spoke unprompted.** No opinions, no observations, no memory
  to reflect back at you.
- **Every interaction was symmetric CRUD.** You do a thing; it acknowledges the
  thing. Which is precisely the description of a calculator.

The app was a very well-built database wearing a plant sticker.

---

## 2. The asset that wasn't being used

Seymour is named after a man-eating plant whose most famous line is an
imperative demand: **"Feed me, Seymour!"** That is a character with a *want* —
the rare case where the brand isn't a logo but a relationship with an appetite.

What the app did with it: the flytrap logo in three places, the line "Feed me,
Seymour" exactly once as a static `<h1>`, and a chef-plant icon in one empty
state. The mascot never changed, never reacted, never grew, never said
anything. It was being used as a favicon.

**The gap between the promise ("feed me") and the delivery (a CRUD table) was
the whole problem.**

---

## 3. The governing principle

> **Personality belongs at the thresholds, not on the work surfaces.**

This is the difference between Duo and Clippy. Clippy failed because it
interrupted the work. Duo succeeds because it is relentlessly consistent in
voice everywhere *around* the lesson and silent *during* it.

- **Work surfaces** — the shopping list while you're standing in an aisle, the
  ingredient list with flour on your hands, the recipe form. Fast, legible,
  high-contrast, boring. No character here. Ever.
- **Thresholds** — first launch, empty states, a completed shopping list, a
  generated plan, a cooked meal, a milestone, an error, the 404, returning
  after two weeks away. This is where the plant lives.

This principle outlived the prospectus and is now the spine of
[`voice.md`](voice.md).

---

## 4. The three directions, and the one chosen

These were alternatives, not a menu to combine — each internally coherent, and
mixing them produces the mush the exercise was trying to escape.

**Direction A — "Feed Me": the app as a creature you keep alive.** The plant as
status object, growing with your collection; reacting to state; language of
feeding rather than filing. Risk: cutesy, and cutesy curdles fast on a utility
you use in a grocery store.

**Direction B — "The Recipe Box": material, tactile, worn.** Recipes as index
cards on off-white stock, a typewriter face for quantities, wear that is real
and earned. Risk: skeuomorphism reads as dated if executed at 80%.

**Direction C — "Little Shop": off-Broadway playbill.** The 1960s musical —
marquee framing, theatrical display face, meals as "the bill". The boldest, the
most unrepeatable, and the most likely to fight the utility.

**What was built: A for behaviour, B for surface.** The creature supplies voice
and reaction; the recipe box supplies texture and materiality. They share a
world — a potting shed, a kitchen counter — and together produce something that
cannot be lifted onto another product, which is the actual test of whether a
design is generic.

---

## 5. The structural change that unlocked the rest

**The cook log.** Recording that a meal was actually cooked, and when.

The app modelled *intent* (a plan) and *inventory* (recipes), but never
*events*. Adding a `cookedAt` history — one table, one "Cooked it" button — was
the smallest change with the largest downstream effect, because it is what
finally made the app **accumulate**. Wear and patina need visible use; the
creature reacting needs something to react *to*; honest observations ("you've
made this 12 times") need the fact the app never learned.

Everything interesting was downstream of it. None of it needs an LLM — it's
rules over your own data, which makes it fast, free, offline, deterministic and
testable.

---

## 6. What shipped

The twelve interventions, all merged:

| Move | PR |
|---|---|
| Cook log (`Cooked it` + history) | #68 |
| Wear/patina on recipe cards, driven by cook count | #69 |
| "Seymour says" — one contextual line, rules over your own data | #70 |
| Voice pass over every string | #71 |
| The 404 page — a hungry plant that ate it | #71 |
| Retire Inter for a display face with a point of view | #72 |
| Repalette — off cream+terracotta to deep botanical green, bone, one acidic accent | #73 |
| Time-of-day awareness — lead with dinner at 5pm | #74 |
| Cook mode — big type, screen awake, one step at a time | #75 |
| Reactive motion at thresholds — a chomp, a lean | #76, #94 |
| Growth stages for the mascot, tied to cooks | #81 |
| Break the five-identical-screens pattern | #82 card, #83 week, #84 list |

---

## 7. What *not* to do

Design leadership is mostly refusal. These still hold:

- **Don't put the character on the work surfaces.** No mascot in the shopping
  list while someone's in an aisle. That's the Clippy mistake.
- **Don't animate everything.** Motion everywhere is its own tell of generated
  design. One orchestrated moment beats six scattered effects.
- **Don't let personality cost clarity.** If a joke makes an error message less
  actionable, the joke loses.
- **Don't add an AI chatbot.** It would be the single most generic possible
  addition, and it would undo the argument of this entire document.
- **Don't half-do Direction B.** Skeuomorphism at 80% looks like a 2011 iOS app.
  All or nothing.
- **Don't ship a "redesign" as one giant PR.** The codebase is healthy — 425
  unit tests, a full e2e suite, clean CI. Preserve that discipline.

---

## Sources / grounding

- [Why Do Most AI-Generated Websites Look the Same? — Shuffle](https://shuffle.dev/blog/2026/01/why-do-most-ai-generated-websites-look-the-same/)
- [AI's Visual Echo: Why Generated Design Looks the Same — Bootcamp](https://medium.com/design-bootcamp/ais-visual-echo-why-generated-design-looks-the-same-and-what-we-should-do-about-it-7d1242f863f3)
- [Why AI Design Looks Generic — Superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic)
- [How Mascots Improve User Experience — Raw.Studio](https://raw.studio/blog/how-mascots-improve-user-experience/)
- [Duolingo's writing guidance for Duo — design.duolingo.com](https://design.duolingo.com/writing/duo)
- [Hands-Free Recipe Navigation: a UX case study](https://medium.com/@calebha_63744/handsfree-recipe-navigation-a-ux-case-study-of-finding-and-following-recipe-like-a-breeze-49cc4cafc408)
- [When Great Products Pause: Arc, Dia, and the Bigger Bet](https://aaashish.medium.com/when-great-products-pause-arc-dia-and-the-bigger-bet-0cc05cceb4b6)
