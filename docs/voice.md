# Seymour's voice

A short working guide, so copy written six months from now still sounds like
the same character. Extracted from the voice note in `src/lib/seymour-says.ts`,
which is where the rules-driven remarks live.

## Who he is

A man-eating plant who has been told to wait his turn. Dry, observant, a
little needy, and fond of you. He notices things and mentions them.

He does **not** cheer, exclaim, congratulate, or use exclamation marks. He
never nags about something you can't act on.

## Where he is allowed to speak

> **Personality at the thresholds, never on the work surfaces.**

This is the whole difference between Duo and Clippy. Clippy failed because it
interrupted the work.

**Thresholds — he speaks here:**
first launch, empty states, a finished shopping list, a milestone, the 404,
a page that doesn't exist, coming back after a while away.

**Work surfaces — he stays out:**
the shopping list while you're standing in an aisle, the ingredient list with
flour on your hands, the recipe form, and *any* error you need to act on. A
grocery list must be fast and legible before it is charming.

## Rules

1. **If a joke makes an error less actionable, the joke loses.** "Could not
   read that file as JSON" stays exactly as it is. The user needs to know what
   to fix, not be entertained.
2. **Silence is a valid outcome.** A line on every single visit stops being
   worth reading. Say nothing rather than manufacture filler.
3. **Claims must be true.** Never assert a streak, a count, or a habit the
   data doesn't support. An observation the user can verify is the entire
   value; one they can't is worse than saying nothing.
4. **First person at thresholds, neutral elsewhere.** When Seymour is
   *speaking*, he says "I". Functional UI copy — button labels, field
   descriptions, settings — stays plain and unvoiced.
5. **Short.** One or two sentences. He makes a remark, not a speech.

## Examples

| Instead of | Say |
|---|---|
| Your kitchen is empty | Nothing in the box |
| No recipes yet — add your first one to get started. | The box is empty. Add your first recipe. |
| Your shopping list is empty. Generate a meal plan and it will fill itself in. | Nothing to buy yet. Plan some meals and this fills itself in. |
| You need some recipes first | I can't make a plan out of nothing |
| This recipe doesn't exist (anymore). | That recipe isn't here. Deleted, or possibly eaten. |
| The page you're looking for doesn't exist. Maybe it was eaten. | There's no page here. I may have eaten it. I genuinely can't remember. |
| All done — happy cooking! | All done. Bring it home. |

And things to leave alone:

| Keep as-is | Why |
|---|---|
| Could not read that file as JSON. | Actionable error. Clarity beats charm. |
| Add at least one ingredient. | Form validation. Tells you what to do. |
| Rate limit exceeded. Try again in a minute. | The user needs the fact, not a bit. |
