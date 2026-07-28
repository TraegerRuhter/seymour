import type { Ingredient, ParsedRecipeData } from './types';
import { isHttpUrl } from './link-safety';
import { normalizeIngredientName } from './normalize';
import { canonicalUnit } from './units';
import { parseIngredient } from './ingredient-parser';

/**
 * Recipe discovery backed by Spoonacular's recipe search API — a real,
 * purpose-built recipe index, not a guess. Replaces the earlier
 * ask-an-LLM-for-candidate-URLs approach: instead of suggesting URLs that
 * then had to be fetched and validated, this returns already-structured
 * recipe data directly, so there's nothing to hallucinate and nothing extra
 * to fetch. Free tier: 150 points/day at spoonacular.com/food-api.
 */

const SEARCH_URL = 'https://api.spoonacular.com/recipes/complexSearch';
const FETCH_TIMEOUT_MS = 15_000;

/**
 * What `fillIngredients=true` returns per ingredient. We were declaring only
 * `original` and re-deriving the rest with our own regex parser, which is a
 * strictly worse reading of a string this API had already parsed.
 */
interface SpoonacularIngredient {
  /** The raw line as the recipe wrote it. Always kept verbatim. */
  original?: string;
  /** Their parse of the amount. */
  amount?: number;
  /** Their unit, in whatever spelling the recipe used ("Tbsps", "cups"). */
  unit?: string;
  /** Ingredient name with the amount and prep words already removed. */
  nameClean?: string;
  name?: string;
}

interface SpoonacularInstructionStep {
  step?: string;
}

interface SpoonacularInstructionGroup {
  steps?: SpoonacularInstructionStep[];
}

export interface SpoonacularRecipe {
  title?: string;
  image?: string;
  sourceUrl?: string;
  spoonacularSourceUrl?: string;
  extendedIngredients?: SpoonacularIngredient[];
  analyzedInstructions?: SpoonacularInstructionGroup[];
}

/**
 * Maps Spoonacular's response shape onto Seymour's own ParsedRecipeData —
 * the same shape a scraped or pasted recipe produces, so results flow
 * through the exact same recipeFromParsed/saveRecipes/auto-tag pipeline.
 * Drops any result missing a title or a usable ingredient list rather than
 * adding a broken recipe to the library.
 */
/**
 * Builds an ingredient from Spoonacular's own parse, or returns null to let
 * our parser read the raw line instead.
 *
 * Their amount and unit are better than ours — they parsed the string on a
 * corpus far larger than the one in tests/fixtures. Their *name* we deliberately
 * put through `normalizeIngredientName` anyway: the shopping list buckets by
 * name, so one vocabulary has to win, and it has to be the one a
 * hand-typed recipe also goes through. Otherwise their "tomatoes" and our
 * "tomato" become two rows.
 *
 * Null whenever their data is unusable — no name left after normalizing, a
 * unit we don't recognize, or a nonsense amount. Falling back costs nothing
 * and never leaves an ingredient out.
 */
export function ingredientFromApi(raw: SpoonacularIngredient): Ingredient | null {
  const originalString = raw.original?.trim();
  if (!originalString) return null;

  const name = normalizeIngredientName((raw.nameClean || raw.name || '').trim());
  if (!name) return null;

  const quantity = typeof raw.amount === 'number' && Number.isFinite(raw.amount) ? raw.amount : 0;
  if (quantity < 0) return null;

  // An unrecognized unit is the interesting case: they hand back things like
  // "servings" and "small" that aren't measurements at all. Dropping the unit
  // rather than the ingredient keeps the row, and a bare count is right more
  // often than a unit the aggregator can't compare.
  const rawUnit = raw.unit?.trim();
  const unit = rawUnit ? (canonicalUnit(rawUnit) ?? '') : '';

  return { name, quantity, unit, originalString, parsedBy: 'api' };
}

export function mapSpoonacularResults(results: SpoonacularRecipe[]): ParsedRecipeData[] {
  return results.flatMap((r): ParsedRecipeData[] => {
    const title = r.title?.trim();
    const usable = (r.extendedIngredients ?? []).filter((i) => i.original?.trim());
    const ingredientLines = usable.map((i) => i.original!.trim());
    if (!title || ingredientLines.length === 0) return [];

    // Per line, not all-or-nothing: one ingredient they couldn't parse
    // shouldn't cost us the good parse of the other twelve.
    const ingredients = usable.map(
      (raw, i) => ingredientFromApi(raw) ?? parseIngredient(ingredientLines[i]),
    );

    const instructions = (r.analyzedInstructions ?? [])
      .flatMap((group) => group.steps ?? [])
      .map((s) => s.step?.trim())
      .filter((s): s is string => !!s);

    // Prefer the recipe's real source page; Spoonacular's own hosted copy is
    // the fallback for the (rare) result with no external one. Neither is
    // validated by Spoonacular against a scheme allowlist, and this ends up
    // rendered as a link href, so a non-http(s) value (this API aggregates
    // from arbitrary third-party sites) is dropped rather than trusted.
    const sourceUrl = [r.sourceUrl, r.spoonacularSourceUrl].find(
      (u): u is string => !!u && isHttpUrl(u),
    );

    return [
      {
        title,
        sourceUrl: sourceUrl ?? '',
        imageUrl: r.image || undefined,
        ingredientLines,
        ingredients,
        instructions,
      },
    ];
  });
}

/** Searches Spoonacular for recipes matching a free-text query. Returns [] when no API key is configured. */
export async function searchRecipes(query: string, count: number): Promise<ParsedRecipeData[]> {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) return [];

  const url = new URL(SEARCH_URL);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('number', String(count));
  url.searchParams.set('addRecipeInformation', 'true');
  url.searchParams.set('instructionsRequired', 'true');
  url.searchParams.set('fillIngredients', 'true');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Spoonacular search failed: HTTP ${res.status}`);

  const body = (await res.json()) as { results?: SpoonacularRecipe[] };
  if (!Array.isArray(body.results)) return [];
  return mapSpoonacularResults(body.results);
}
