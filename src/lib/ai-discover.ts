const SYSTEM_PROMPT =
  "You suggest real, currently-live recipe URLs matching a user's search. Respond ONLY with JSON of " +
  'shape {"recipes": [{"url": string, "title": string}]}. Each url must be a direct link to one specific ' +
  "recipe's page (never a homepage, category listing, or search-results page) on a real, well-known " +
  'public recipe website (e.g. allrecipes.com, seriouseats.com, bonappetit.com, foodnetwork.com, ' +
  'simplyrecipes.com, budgetbytes.com, cookieandkate.com, food52.com, epicurious.com, tasteofhome.com, ' +
  'thepioneerwoman.com, kingarthurbaking.com, smittenkitchen.com). Never invent or guess a URL you are ' +
  'not confident actually exists — omit a candidate entirely rather than fabricate one. Prefer variety: ' +
  'different specific recipes and different sites, not near-duplicates of each other. Return more ' +
  'candidates than the requested count when you can, since some will fail to load later — the caller ' +
  'fetches and validates each one and only keeps what actually turns out to be a real recipe page.';

export interface RecipeCandidate {
  url: string;
  title?: string;
}

/**
 * Asks an LLM for candidate recipe URLs matching a free-text query. This is
 * a *suggestion* step only — nothing here is trusted or added to the
 * library. Every candidate still has to pass through the same fetch +
 * JSON-LD/microdata/AI-extraction pipeline "paste a URL" uses (parseOne in
 * parse-url.ts), so a hallucinated or dead URL just fails to produce a
 * result rather than polluting the recipe box.
 */
export async function suggestRecipeUrls(
  query: string,
  candidateCount: number,
): Promise<RecipeCandidate[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Suggest up to ${candidateCount} candidate recipe URLs for: ${query}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Recipe discovery failed: HTTP ${res.status}`);

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return [];

  const parsed = JSON.parse(content) as { recipes?: Array<{ url?: unknown; title?: unknown }> };
  if (!Array.isArray(parsed.recipes)) return [];

  return parsed.recipes
    .filter(
      (r): r is { url: string; title?: unknown } =>
        typeof r.url === 'string' && r.url.trim().length > 0,
    )
    .map((r) => ({
      url: r.url.trim(),
      title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : undefined,
    }));
}
