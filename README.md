# Seymour 🪴

_"Feed me, Seymour."_ A single-user, browser-first web app that turns online recipes into a
structured personal collection, generates randomized meal plans, and produces smart,
consolidated shopping lists with a single tap. Named for the hungriest plant in showbiz.

Everything lives in **your browser** (IndexedDB) — no accounts, no server database, fully
private. A thin Next.js API route handles recipe parsing; everything else runs client-side
and works offline as an installable PWA.

## Features

- **Recipe input & parsing** — paste one or more URLs; the `/api/parse` route extracts the
  title, image, ingredients, and instructions from the page's schema.org `Recipe`
  structured data (JSON-LD), with an optional OpenAI GPT-4o-mini fallback for stubborn
  pages. **Manual entry** (`/add?mode=manual`) is always available for unsupported sites,
  and any saved recipe can be edited by hand. When even that fails — a page that's
  paywalled, requires login, or is blocked outright — **paste the page's text** (select-all,
  copy, paste) and `/api/parse-text` pulls out the title/ingredients/steps to pre-fill the
  manual form: the AI extracts it when `OPENAI_API_KEY` is set, otherwise a dependency-free
  heading-based heuristic (looks for "Ingredients"/"Instructions" sections, validated against
  the content that follows so a nav link literally labeled "Ingredients" can't hijack the
  real section) does its best. Since plain text can't carry an image, every manual/pasted
  entry gets an image field that accepts a URL, a pasted clipboard image (⌘/Ctrl+V), a
  drag-and-drop, or a file picker — pasted/dropped images are stored as data URLs, no
  server upload needed. Either way you review and edit before saving.
- **Recipe library** — glassmorphism card grid or compact list, live title search, detail
  view with print styles, edit and delete (with confirmation).
- **Meal plan generator** — pick 1–14 days and which meals (breakfast/lunch/dinner/snack);
  a seeded Fisher–Yates shuffle fills every slot with no repeats within a day (repeats
  across days only when the collection is small). Shuffle re-rolls with a new seed; empty
  slots offer a manual picker.
- **Smart shopping list** — ingredients from all planned meals are normalized (synonym map
  + plural stemming: "yellow onion" ≡ "onions"), with countable units recognized on either
  side of the name ("2 cloves garlic" ≡ "2 garlic cloves") and a sensible default unit for
  ambiguous bare counts ("1 garlic" is read as 1 clove, not 1 head), converted to base units
  (mL/g), summed,
  and converted back to human-readable amounts with unicode fractions ("½ cup", "1¾ lb").
  Unconvertible units (cloves, pinches) never sum with unlike units. Checking off an item
  plays a drawn-checkmark + strikethrough animation and moves it to a collapsible Checked
  section. Inline edits override aggregation per item. Everything persists across reloads.
- **Auto re-aggregation** — the list rebuilds whenever the plan or collection changes
  (regenerate, delete, edit…), carrying over checked state and manual edits.
- **Backup** — Settings offers full JSON export and validated import.
- **Dark mode** — light / dark / system theme (Settings → Appearance). The palette is driven
  by CSS variables, the choice persists in localStorage, a pre-hydration script prevents a
  light flash, and "system" tracks OS changes live. Printing always uses the light palette.
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

| Variable              | Required | Purpose                                                        |
| --------------------- | -------- | -------------------------------------------------------------- |
| `OPENAI_API_KEY`      | No       | Enables the AI fallback in `/api/parse` when structured-data scraping fails. Server-side only; never reaches the client. |
| `RECIPE_READER_PROXY` | No       | Reader-proxy fallback for sites that block direct server-side fetches (Cloudflare-protected sites like Allrecipes reject datacenter IPs). **Defaults to Jina AI Reader** (`https://r.jina.ai/{url}`) when unset. Override with your own `{url}` template, or set to `off` to disable all third-party calls. |

Copy `.env.example` to `.env.local` and fill in whichever you want.

#### Why some recipes need the reader proxy

Big recipe sites (Allrecipes, NYT Cooking, Serious Eats…) sit behind Cloudflare,
which blocks requests from datacenter IPs — including the ones Vercel's servers
run on — regardless of how browser-like the request looks. A direct fetch gets
a `403`, so there's nothing to parse. The reader proxy routes those blocked
pages through a service (Jina AI Reader by default) that fetches them from
residential-grade infrastructure and returns the HTML, which Seymour then parses
normally. It's only used as a fallback when a direct fetch is blocked or yields
no recipe, so reachable sites never touch the proxy. Set `RECIPE_READER_PROXY=off`
to disable it; manual entry always works regardless.

### Tests

```bash
npm test
```

Unit tests (Node's built-in runner via `tsx`) cover the ingredient parser, unit
conversion/formatting, the aggregation engine, and the seeded plan generator.

For the full pre-merge validation suite, run:

```bash
npm run check
```

That command runs the unit tests, TypeScript type checking, and a production
Next.js build. The same command runs in GitHub Actions for pushes to `main` and
pull requests.

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

Seymour is a standard Next.js app with one server-side API route (`/api/parse`
for URL scraping + the optional AI fallback), so it needs a host that runs
Node — **Vercel** is the path of least resistance. A purely static host (e.g.
GitHub Pages) can serve everything else, but the "paste a URL to import"
feature won't work there because it has no server to run the parser.

### Deploy to Vercel

1. Push to GitHub (already done — the default branch is `main`).
2. At [vercel.com/new](https://vercel.com/new), **Import** the `TraegerRuhter/seymour`
   repo. Vercel auto-detects Next.js — no build settings to change
   (build: `next build`, output handled automatically, API route runs as a
   serverless function).
3. **Deploy.** Cloudflare-protected sites (Allrecipes, NYT Cooking…) work out
   of the box — the reader-proxy fallback defaults to Jina AI Reader, so no
   configuration is needed.
4. *(Optional)* Under **Settings → Environment Variables**:
   - `OPENAI_API_KEY` — adds an AI fallback for pages that have no schema.org
     recipe data at all. Scraping already works on most sites without it.
   - `RECIPE_READER_PROXY` — override the default reader proxy with your own
     `{url}` template, or set it to `off` to disable all third-party calls
     (Cloudflare sites then require manual entry).

Every push to `main` redeploys; branches get preview URLs.

Data stays in each visitor's browser (IndexedDB) — there's no server database
to provision.
