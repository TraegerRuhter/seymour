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
