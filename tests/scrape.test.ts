import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRecipeFromHtml, extractRecipeFromMicrodata } from '../src/lib/scrape.ts';

test('extractRecipeFromHtml: reads a standard JSON-LD Recipe node', () => {
  const html = `
    <html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Recipe","name":"Chicken Curry",
         "image":"https://example.com/img.jpg",
         "recipeIngredient":["2 chicken breasts","1 onion, diced"],
         "recipeInstructions":[{"@type":"HowToStep","text":"Sauté the onion."},{"@type":"HowToStep","text":"Add the chicken."}]}
      </script>
    </head><body></body></html>`;
  const result = extractRecipeFromHtml(html, 'https://example.com/curry');
  assert.ok(result);
  assert.equal(result!.title, 'Chicken Curry');
  assert.equal(result!.imageUrl, 'https://example.com/img.jpg');
  assert.deepEqual(result!.ingredientLines, ['2 chicken breasts', '1 onion, diced']);
  assert.deepEqual(result!.instructions, ['Sauté the onion.', 'Add the chicken.']);
});

test('extractRecipeFromHtml: returns null when the only Recipe node has no ingredients (stub JSON-LD)', () => {
  // Real-world case: a JSON-LD block that exists purely for rich-snippet
  // star ratings, with no recipeIngredient/recipeInstructions at all — the
  // actual recipe data lives elsewhere (e.g. HTML microdata).
  const html = `
    <script type="application/ld+json">
      {"@context":"https://schema.org/","@type":"recipe","name":"Key Lime Pie Ice Cream Sandwiches",
       "image":"https://broccyourbody.com/wp-content/uploads/2026/06/View-recent-photos.png",
       "aggregateRating":{"@type":"AggregateRating","ratingValue":"5","bestRating":"5","ratingCount":"3"}}
    </script>`;
  assert.equal(extractRecipeFromHtml(html, 'https://broccyourbody.com/x'), null);
});

// Trimmed excerpt of the real broccyourbody.com recipe-card markup (the site
// that surfaced this bug): itemprop="recipeIngredient ingredients" (a
// space-separated multi-value itemprop) on each <li>, and
// itemprop="recipeInstructions" on the wrapping container rather than on
// each step.
const MICRODATA_HTML = `
<div class="recipe-card h-recipe" id="recipe-card" itemscope itemtype="https://schema.org/Recipe">
  <div class="recipe-details">
    <div class="image">
      <img src="https://broccyourbody.com/wp-content/uploads/2026/06/View-recent-photos.png" itemprop="image" alt="Brocc Your Body" class="u-photo">
    </div>
    <div class="contents">
      <h5>AUTHOR: <span itemprop="author">broccyourbody</span></h5>
      <h2 class="p-name" itemprop="name">Key Lime Pie Ice Cream Sandwiches</h2>
      <h5>SERVES: <span itemprop="recipeYield" class="p-yield">9 large or 16 small squares</span></h5>
    </div>
  </div>
  <div class="content-inner">
    <div class="recipe-ingredient">
      <h4>Ingredients</h4>
      <div class="ingredients">
        <strong>For the Graham Cracker Crust &amp; Topping:</strong>
        <ul>
          <li itemprop="recipeIngredient ingredients" class="p-ingredient">12 oz graham crackers, about 3 sleeves</li>
          <li itemprop="recipeIngredient ingredients" class="p-ingredient">1 1/2 sticks salted butter, melted</li>
        </ul>
        <strong>For the Key Lime Ice Cream:</strong>
        <ul>
          <li itemprop="recipeIngredient ingredients" class="p-ingredient">2 cups heavy whipping cream</li>
          <li itemprop="recipeIngredient ingredients" class="p-ingredient">1/3 cup freshly squeezed key lime juice</li>
        </ul>
      </div>
    </div>
    <div class="recipe-instruction">
      <h4>Instructions</h4>
      <div class="instructions e-instructions" itemprop="recipeInstructions">
        <ol>
          <li style="font-weight: 400;" aria-level="1"><span style="font-weight: 400;">Line a 9x9-inch pan with parchment paper.</span></li>
          <li style="font-weight: 400;" aria-level="1"><span style="font-weight: 400;">Pulse the graham crackers into fine crumbs.</span></li>
          <li style="font-weight: 400;" aria-level="1"><span style="font-weight: 400;">Freeze until firm, then slice into squares.</span></li>
        </ol>
      </div>
    </div>
  </div>
</div>`;

// --- JSON-LD shapes that used to fall through --------------------------------
//
// Each of these is valid structured data that the scraper read as "no recipe
// here", sending the import to the AI fallback or failing it outright. They
// were found by probing with realistic shapes, not from bug reports — a failed
// import just looks like a site that doesn't work.

const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const lines = (html: string) =>
  extractRecipeFromHtml(html, 'https://example.com/r')?.ingredientLines;

test('extractRecipeFromHtml: a stub Recipe ahead of the real one in the same @graph', () => {
  // What an SEO plugin emits next to the recipe plugin's node. The walk used to
  // return the stub, find no ingredients, and move on to the next *script
  // block* — never looking at the second node in this one.
  const html = ld({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'Oyster Stew' },
      { '@type': 'Recipe', name: 'Oyster Stew', aggregateRating: { ratingValue: 4.8 } },
      {
        '@type': 'Recipe',
        name: 'Oyster Stew',
        recipeIngredient: ['1 pint oysters', '2 cups milk'],
      },
    ],
  });
  assert.deepEqual(lines(html), ['1 pint oysters', '2 cups milk']);
});

test('extractRecipeFromHtml: ingredients published as objects rather than strings', () => {
  const html = ld({
    '@type': 'Recipe',
    name: 'Stew',
    recipeIngredient: [
      { '@type': 'HowToSupply', name: '1 pint oysters' },
      { text: '2 cups milk' },
      '1 tsp salt',
    ],
  });
  assert.deepEqual(lines(html), ['1 pint oysters', '2 cups milk', '1 tsp salt']);
});

test('extractRecipeFromHtml: @type written as a full IRI or with a prefix', () => {
  for (const type of [
    'https://schema.org/Recipe',
    'http://schema.org/Recipe',
    'schema:Recipe',
    ['Article', 'https://schema.org/Recipe'],
  ]) {
    const html = ld({ '@type': type, name: 'Stew', recipeIngredient: ['2 cups milk'] });
    assert.deepEqual(lines(html), ['2 cups milk'], `@type ${JSON.stringify(type)}`);
  }
  // Not everything ending in "recipe" is one.
  assert.equal(
    lines(ld({ '@type': 'https://example.com/NotARecipe', recipeIngredient: ['2 cups milk'] })),
    undefined,
  );
});

test('extractRecipeFromHtml: a Recipe under a key other than @graph or mainEntity', () => {
  const html = ld({
    '@type': 'WebPage',
    mainEntityOfPage: {
      '@type': 'Article',
      hasPart: [{ '@type': 'Recipe', name: 'Stew', recipeIngredient: ['2 cups milk'] }],
    },
  });
  assert.deepEqual(lines(html), ['2 cups milk']);
});

test('extractRecipeFromHtml: a Recipe nested deeper than the old limit of six', () => {
  let node: unknown = { '@type': 'Recipe', name: 'Stew', recipeIngredient: ['2 cups milk'] };
  for (let i = 0; i < 10; i++) node = { '@graph': [node] };
  assert.deepEqual(lines(ld(node)), ['2 cups milk']);
});

test('extractRecipeFromHtml: absurd nesting is refused rather than overflowing the stack', () => {
  let node: unknown = { '@type': 'Recipe', name: 'Stew', recipeIngredient: ['2 cups milk'] };
  for (let i = 0; i < 500; i++) node = { a: node };
  assert.equal(lines(ld(node)), undefined);
});

test('extractRecipeFromHtml: JSON-LD inside a CDATA or HTML-comment wrapper', () => {
  const json = JSON.stringify({
    '@type': 'Recipe',
    name: 'Stew',
    recipeIngredient: ['2 cups milk'],
  });
  for (const wrapped of [
    `//<![CDATA[\n${json}\n//]]>`,
    `/*<![CDATA[*/\n${json}\n/*]]>*/`,
    `<![CDATA[${json}]]>`,
    `<!--\n${json}\n-->`,
  ]) {
    const html = `<script type="application/ld+json">${wrapped}</script>`;
    assert.deepEqual(lines(html), ['2 cups milk'], wrapped.slice(0, 14));
  }
});

test('extractRecipeFromHtml: a rating-only Recipe inside a Review is not taken for the recipe', () => {
  // Walking every key reaches nodes like this one. It is still skipped,
  // because a node has to carry ingredients to be used.
  const html = ld({
    '@type': 'Review',
    itemReviewed: { '@type': 'Recipe', name: "Someone else's stew" },
  });
  assert.equal(lines(html), undefined);
});

test('extractRecipeFromHtml: the first Recipe with ingredients wins across blocks', () => {
  const html =
    ld({ '@type': 'Recipe', name: 'Main', recipeIngredient: ['1 pint oysters'] }) +
    ld({ '@type': 'Recipe', name: 'Related', recipeIngredient: ['2 eggs'] });
  const result = extractRecipeFromHtml(html, 'https://example.com/r');
  assert.equal(result?.title, 'Main');
});

test('extractRecipeFromMicrodata: reads title, ingredients, image, and instructions from a real recipe-card fixture', () => {
  const result = extractRecipeFromMicrodata(
    MICRODATA_HTML,
    'https://broccyourbody.com/key-lime-pie-ice-cream-sandwiches/',
  );
  assert.ok(result);
  assert.equal(result!.title, 'Key Lime Pie Ice Cream Sandwiches');
  assert.equal(
    result!.imageUrl,
    'https://broccyourbody.com/wp-content/uploads/2026/06/View-recent-photos.png',
  );
  assert.deepEqual(result!.ingredientLines, [
    '12 oz graham crackers, about 3 sleeves',
    '1 1/2 sticks salted butter, melted',
    '2 cups heavy whipping cream',
    '1/3 cup freshly squeezed key lime juice',
  ]);
  assert.deepEqual(result!.instructions, [
    'Line a 9x9-inch pan with parchment paper.',
    'Pulse the graham crackers into fine crumbs.',
    'Freeze until firm, then slice into squares.',
  ]);
});

test('extractRecipeFromMicrodata: returns null when there is no schema.org/Recipe itemtype at all', () => {
  assert.equal(
    extractRecipeFromMicrodata(
      '<div>just a blog post, no recipe markup</div>',
      'https://example.com',
    ),
    null,
  );
});

test('extractRecipeFromMicrodata: returns null when the Recipe scope has no recipeIngredient items', () => {
  const html = `<div itemscope itemtype="https://schema.org/Recipe"><h2 itemprop="name">Empty</h2></div>`;
  assert.equal(extractRecipeFromMicrodata(html, 'https://example.com'), null);
});

test('extractRecipeFromMicrodata: falls back to "Untitled recipe" when itemprop="name" is missing', () => {
  const html = `<div itemscope itemtype="https://schema.org/Recipe">
    <li itemprop="recipeIngredient">1 egg</li>
  </div>`;
  const result = extractRecipeFromMicrodata(html, 'https://example.com');
  assert.ok(result);
  assert.equal(result!.title, 'Untitled recipe');
});

test('extractRecipeFromMicrodata: handles recipeInstructions tagged per-step instead of on a container', () => {
  const html = `<div itemscope itemtype="https://schema.org/Recipe">
    <span itemprop="name">Toast</span>
    <li itemprop="recipeIngredient">2 slices bread</li>
    <li itemprop="recipeInstructions">Toast the bread.</li>
    <li itemprop="recipeInstructions">Butter it.</li>
  </div>`;
  const result = extractRecipeFromMicrodata(html, 'https://example.com');
  assert.ok(result);
  assert.deepEqual(result!.instructions, ['Toast the bread.', 'Butter it.']);
});
