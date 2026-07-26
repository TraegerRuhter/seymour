# Seymour — Design Prospectus

**On why it feels like a calculator, and what to do about it.**

Status: thinking document, not a plan of record. Nothing here is committed to.
Written July 2026, after a full read of the codebase.

---

## 1. The diagnosis, in three layers

The complaint — "it's functional but there's no sauce" — is accurate, and it's
worth separating into three layers, because only the first one is the layer
people usually argue about.

### Layer 1: the surface (the one everyone talks about)

Seymour's palette is warm cream (`#FAF7F2`) + terracotta accent (`#E07A5F`) +
Inter + `rounded-2xl` + glassmorphism cards.

This is not *a* generic look. It is close to *the* generic look. Anthropic's own
internal design guidance lists the current AI-design clichés to avoid, and the
first item on that list is, near-verbatim: *"warm cream with a serif display and
terracotta accent."* It also names "Inter as the safe face," "`rounded-lg`
everywhere," and "accent bar/rail on rounded cards." Seymour hits four for four.

That's not an accident or a failure of taste — it's what happens when a palette
gets chosen by asking for "warm and inviting." The statistical center of the
training data *is* warm cream and terracotta.

### Layer 2: the architecture (rarely discussed, very visible)

Every screen in the app is the same shape:

```
<h1>Title</h1>
<p class="text-charcoal/60">Muted subtitle</p>
→ sections of glass-cards in a responsive grid
```

Home, Recipes, Plan, Shopping list, Settings — five destinations, one skeleton.
No screen has earned its own layout logic. Nothing feels like a *place*; it feels
like five views onto the same table. This is why it reads as "an admin panel for
recipes" rather than "a kitchen."

### Layer 3: the behaviour (the real problem)

This is the one that actually explains "it feels like a calculator."

- **Nothing accumulates.** There is no record that you ever *cooked* anything.
  `Recipe` has `rating` and `notes`, but no cook events. Recipe #1 and recipe
  #200 are identical objects with identical histories: none.
- **Nothing improves with use.** The app on day 400 behaves exactly like the app
  on day 1, just with more rows.
- **The app never speaks unprompted.** It has no opinions, no observations, no
  memory it can reflect back at you.
- **Every interaction is symmetric CRUD.** You do a thing; it acknowledges the
  thing. Input, output. Which is precisely the description of a calculator.

A calculator is a fair comparison and a fair complaint. The app is a very
well-built database wearing a plant sticker.

---

## 2. The asset that isn't being used

Seymour is named after a man-eating plant whose single most famous line is an
imperative demand: **"Feed me, Seymour!"**

That is a character with a *want*. Most products would pay dearly for that and
never get it. It's the rare case where the brand isn't a logo — it's a
relationship with an appetite.

What the app does with it:

| Asset | Where it appears |
|---|---|
| `Logo.tsx` — a hand-built flytrap: jaws, teeth, eyes, terracotta pot | Header (36px), loading screen, one empty state. **3 places.** |
| The line "Feed me, Seymour" | **Once.** A static `<h1>` on the dashboard. |
| `ChefPlantIcon` | **One** empty state. |

The mascot never changes, never reacts, never grows, never says anything. It is
being used as a favicon.

**The gap between the promise ("feed me") and the delivery (a CRUD table) is the
whole problem.** Everything below is a way of closing it.

---

## 3. The governing principle

> **Personality belongs at the thresholds, not on the work surfaces.**

This is the difference between Duo and Clippy. Clippy failed because it
interrupted the work. Duo succeeds because it is relentlessly consistent in
voice everywhere *around* the lesson and silent *during* it.

For Seymour, concretely:

- **Work surfaces** — the shopping list while you're standing in an aisle, the
  ingredient list while your hands are covered in flour, the recipe form. These
  must be fast, legible, high-contrast, and boring. No character here. Ever.
- **Thresholds** — first launch, empty states, a completed shopping list, a
  generated plan, a cooked meal, a milestone, an error, the 404, returning after
  two weeks away. This is where the plant lives.

Thresholds are also, conveniently, where the app currently says the least.

---

## 4. Three directions

These are alternatives, not a menu to combine. Each is internally coherent;
mixing them produces the mush we're trying to escape.

### Direction A — "Feed Me": the app as a creature you keep alive

The strongest use of what you already own.

- **The plant is the status object.** It grows with your collection: a seedling
  at zero recipes, leafy at a dozen, an unmistakable monster with vines at a
  hundred. Not a progress bar — a pet.
- **It reacts to state.** Droops when the plan is empty and the week's ahead of
  you. Perks up when you cook. Eyes go wide when the shopping list is one item
  from done. Chomps when it's finished.
- **The language is feeding, not filing.** "Feed Seymour a recipe," not "Add
  recipe." The empty state isn't "Your kitchen is empty," it's the plant looking
  at you, hungry.
- **Risk:** cutesy, and cutesy curdles fast on a utility you use in a grocery
  store. **Mitigation:** the governing principle above — sober, adult chrome on
  every work surface; the creature only at thresholds.

### Direction B — "The Recipe Box": material, tactile, worn

The strongest *visual* escape from the AI look.

- Recipes are **index cards**, not glass cards. Off-white stock, a subtle rule,
  a typewriter face for quantities.
- **Wear is real and earned.** A recipe you've cooked twelve times looks
  different from one you've never made — a stain, a softened corner, a fingerprint
  in the margin. Use *is visible*. (This requires the cook log; see §5.)
- The shopping list is a torn sheet, the plan is a week ruled out by hand.
- Slight rotations, imperfect alignment, real texture. Nothing is `rounded-2xl`.
- **Risk:** skeuomorphism reads as dated if executed at 80%. This one is
  all-or-nothing and needs real craft.

### Direction C — "Little Shop": off-Broadway playbill

The boldest and the most fun.

- Lean the whole identity into the 1960s musical the app is named after: a
  condensed display face with theatrical weight, marquee framing, a saturated
  palette that isn't terracotta (deep botanical green, bone, a single acidic
  chartreuse), section headings set like billing on a poster.
- Meals are "the bill." The week is a "programme." Cooking is "service."
- **Risk:** the highest — a strong theme can fight the utility. But it is the
  single most *unrepeatable* direction. No other app can plausibly wear it.

**My recommendation:** **A for behaviour, B for surface.** The creature supplies
voice and reaction; the recipe box supplies texture and materiality. They share a
world (a potting shed, a kitchen counter) and together produce something that
cannot be lifted onto another product — which is the actual test of whether a
design is generic.

---

## 5. The one structural change that unlocks most of this

**Add a cook log.** Record that a meal was actually cooked, and when.

Today the app models *intent* (a plan) and *inventory* (recipes), but never
*events*. Adding a `cookedAt` history — one small table, one button, "Cooked it"
— is the smallest change with the largest downstream effect, because it is the
thing that finally makes the app **accumulate**:

- Enables **wear and patina** (Direction B) — visible use.
- Enables **the creature reacting** (Direction A) — something to react *to*.
- Enables **honest observations**: "You've made this 12 times." "You haven't
  cooked this since March." "Third Sunday running for pancakes."
- Enables **better planning**: deprioritise something cooked twice this week;
  surface a recipe you loved and forgot.
- Enables **streaks and milestones** — real thresholds to celebrate.
- Enables **a year in review**, which is the kind of thing people screenshot.

Everything interesting in §4 is downstream of the app knowing what you actually
cooked. Right now it's the one fact it never learns.

Worth noting: none of this needs an LLM. It's rules over your own data, which
makes it fast, free, offline, deterministic, and testable — all things this
codebase is already good at.

---

## 6. Menu of interventions

Rough sizing. `S` = an afternoon, `M` = a day or two, `L` = a real project.

| # | Move | Size | Payoff | Status |
|---|---|---|---|---|
| 1 | **Voice pass over every string.** Empty states, errors, confirmations, the 404. Currently all neutral-competent. Cheapest personality in the app. | S | High | shipped (#71) |
| 2 | **The 404 page.** Free canvas, currently wasted. A hungry plant that ate the page. | S | Med | shipped (#71) |
| 3 | **Cook log** (`Cooked it` button + history). See §5. | M | Very high | shipped (#68) |
| 4 | **Growth stages for the mascot** tied to collection size / cook streak. | M | High | shipped (#81 — tied to cooks) |
| 5 | **Retire Inter.** A display face with a point of view is the fastest way to stop looking generated. | S | High | shipped (#72) |
| 6 | **Repalette.** Move off cream+terracotta. Deep botanical green, bone, one acidic accent. | M | High | shipped (#73) |
| 7 | **Break the five-identical-screens pattern.** Let the plan look like a week, the list look like a list, the recipe look like a card. | L | High | — |
| 8 | **Time-of-day awareness.** The app knows it's 5pm; it could lead with dinner. Almost nothing does this well and it's nearly free. | S | Med | shipped (#74) |
| 9 | **"Seymour says"** — one contextual, opinionated line on the dashboard, driven by rules over your own data. Enormous personality-per-byte. | M | High | shipped (#70) |
| 10 | **Reactive motion at thresholds** — a chomp when the last item is checked off, a lean when a plan lands. Replace generic fade-rise. | M | Med | partly shipped (#76 — the chomp) |
| 11 | **Cook mode** — the guided, hands-messy cooking view (big type, screen stays awake, one step at a time). Genuinely useful *and* a threshold moment. | L | High | shipped (#75) |
| 12 | **Wear/patina on recipe cards** driven by cook count. | M | Med | shipped (#69) |

---

## 7. What *not* to do

Design leadership is mostly refusal. Explicitly:

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
- **Don't ship a "redesign" as one giant PR.** The current codebase is healthy
  (172 unit tests, full e2e suite, clean CI). Preserve that discipline.

---

## 8. Suggested first slice

If the goal is maximum evidence for minimum spend — enough to feel whether this
is right before committing to a re-skin:

1. **Cook log** (§5) — the structural foundation. Nothing else is as leveraged.
2. **Voice pass + 404** (§6.1, §6.2) — cheap, immediate, reversible.
3. **"Seymour says" on the dashboard** (§6.9) — proves the character can be
   present without being annoying, and it's only interesting *because* of #1.

That's roughly one focused session. It changes zero pixels of the palette, so
it's not a bet on any direction in §4 — but it makes the app *accumulate*, which
is the difference between a calculator and something you'd be glad to open.

The re-skin (type, palette, layout) is the second act, and worth deciding on
only after the app has something to say.

---

## Sources / grounding

- [Why Do Most AI-Generated Websites Look the Same? — Shuffle](https://shuffle.dev/blog/2026/01/why-do-most-ai-generated-websites-look-the-same/)
- [AI's Visual Echo: Why Generated Design Looks the Same — Bootcamp](https://medium.com/design-bootcamp/ais-visual-echo-why-generated-design-looks-the-same-and-what-we-should-do-about-it-7d1242f863f3)
- [Why AI Design Looks Generic — Superdesign](https://superdesign.dev/blog/why-ai-design-looks-generic)
- [How Mascots Improve User Experience — Raw.Studio](https://raw.studio/blog/how-mascots-improve-user-experience/)
- [Duolingo's writing guidance for Duo — design.duolingo.com](https://design.duolingo.com/writing/duo)
- [Hands-Free Recipe Navigation: a UX case study](https://medium.com/@calebha_63744/handsfree-recipe-navigation-a-ux-case-study-of-finding-and-following-recipe-like-a-breeze-49cc4cafc408)
- [When Great Products Pause: Arc, Dia, and the Bigger Bet](https://aaashish.medium.com/when-great-products-pause-arc-dia-and-the-bigger-bet-0cc05cceb4b6)
