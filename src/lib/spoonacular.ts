import type { ParsedRecipeData } from './types';

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

interface SpoonacularIngredient {
  original?: string;
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
export function mapSpoonacularResults(results: SpoonacularRecipe[]): ParsedRecipeData[] {
  return results.flatMap((r): ParsedRecipeData[] => {
    const title = r.title?.trim();
    const ingredientLines = (r.extendedIngredients ?? [])
      .map((i) => i.original?.trim())
      .filter((s): s is string => !!s);
    if (!title || ingredientLines.length === 0) return [];

    const instructions = (r.analyzedInstructions ?? [])
      .flatMap((group) => group.steps ?? [])
      .map((s) => s.step?.trim())
      .filter((s): s is string => !!s);

    return [
      {
        title,
        // Prefer the recipe's real source page; Spoonacular's own hosted
        // copy is the fallback for the (rare) result with no external one.
        sourceUrl: r.sourceUrl || r.spoonacularSourceUrl || '',
        imageUrl: r.image || undefined,
        ingredientLines,
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
