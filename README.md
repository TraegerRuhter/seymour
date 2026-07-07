# RecipeBoard 🍳

A single-user, browser-first web app that turns online recipes into a structured personal
collection, generates randomized meal plans, and produces smart, consolidated shopping
lists with a single tap.

Everything lives in **your browser** (IndexedDB) — no accounts, no server database, fully
private. A thin Next.js API route handles recipe parsing; everything else runs client-side
and works offline as an installable PWA.

## Features

- **Recipe input & parsing** — paste one or more URLs; the `/api/parse` route extracts the
  title, image, ingredients, and instructions from the page's schema.org `Recipe`
  structured data (JSON-LD), with an optional OpenAI GPT-4o-mini fallback for stubborn
  pages. Manual add/edit is always available.
- **Recipe library** — glassmorphism card grid or compact list, live title search, detail
  view with print styles, edit and delete (with confirmation).
- **Meal plan generator** — pick 1–14 days and which meals (breakfast/lunch/dinner/snack);
  a seeded Fisher–Yates shuffle fills every slot with no repeats within a day (repeats
  across days only when the collection is small). Shuffle re-rolls with a new seed; empty
  slots offer a manual picker.
- **Smart shopping list** — ingredients from all planned meals are normalized (synonym map
  + plural stemming: "yellow onion" ≡ "onions"), converted to base units (mL/g), summed,
  and converted back to human-readable amounts with unicode fractions ("½ cup", "1¾ lb").
  Unconvertible units (cloves, pinches) never sum with unlike units. Checking off an item
  plays a drawn-checkmark + strikethrough animation and moves it to a collapsible Checked
  section. Inline edits override aggregation per item. Everything persists across reloads.
- **Auto re-aggregation** — the list rebuilds whenever the plan or collection changes
  (regenerate, delete, edit…), carrying over checked state and manual edits.
- **Backup** — Settings offers full JSON export and validated import.
- **PWA** — installable, offline-capable (library, plan, and list work without network;
  parsing requires connectivity), viewed recipe images are cached.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Framer Motion ·
Zustand (persisted to IndexedDB via localforage) · nanoid

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

### Environment variables

| Variable         | Required | Purpose                                                        |
| ---------------- | -------- | -------------------------------------------------------------- |
| `OPENAI_API_KEY` | No       | Enables the AI fallback in `/api/parse` when structured-data scraping fails. Server-side only; never reaches the client. |

Copy `.env.example` to `.env.local` and fill in the key if you want the fallback.

### Tests

```bash
npm test
```

Unit tests (Node's built-in runner via `tsx`) cover the ingredient parser, unit
conversion/formatting, the aggregation engine, and the seeded plan generator.

## Architecture notes

- **Thin backend, rich client** — the only server code is `/api/parse`. All state lives in
  three Zustand stores persisted to IndexedDB (`src/lib/stores.ts`); cross-store
  orchestration (delete cascades, list re-aggregation) is centralized in
  `src/lib/actions.ts`.
- **Parsing pipeline** — the prospectus suggested the `recipe-scraper` npm package; it is
  unmaintained, so the same mechanism it used is implemented natively in
  `src/lib/scrape.ts`: fetch the page and read the schema.org `Recipe` JSON-LD that
  virtually all recipe sites publish (it's required for Google rich results). The OpenAI
  fallback covers the rest, and manual entry covers everything else.
- **Aggregation engine** (`src/lib/aggregate.ts`, `units.ts`, `normalize.ts`,
  `ingredient-parser.ts`) — pure, synchronous, dependency-free modules; O(n) over
  ingredient rows.
- **Service worker** (`public/sw.js`) — hand-rolled (no Workbox dependency):
  stale-while-revalidate for assets, network-first navigations with cache fallback,
  cache-first for cross-origin recipe images with an entry cap, network-only for `/api/*`.

## Deployment

Deploys as a standard Next.js app (e.g. Vercel): connect the repo, set
`OPENAI_API_KEY` (optional), done. Data stays in each visitor's browser.
