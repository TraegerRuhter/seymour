import type { ParsedRecipeData } from './types';

const SYSTEM_PROMPT =
  'You extract recipes from text (which may be a web page dump or text pasted by a user, ' +
  'possibly containing navigation, ads, or comments mixed in). Respond ONLY with JSON of shape ' +
  '{"title": string, "imageUrl": string|null, "ingredientLines": string[], "instructions": string[]}. ' +
  'ingredientLines are the raw ingredient strings exactly as written (one per entry, including quantities and units). ' +
  'instructions are the preparation steps in order, one step per entry. Ignore unrelated clutter such as site ' +
  'navigation, ads, comments, or related-recipe links. If the text contains no recipe, respond {"title": null}.';

interface AiExtractOptions {
  /** The readable text to extract a recipe from. */
  text: string;
  /** Attached to the result and shown to the model as context, when known. */
  sourceUrl?: string;
}

/**
 * Extracts a recipe from arbitrary text via an LLM. Used both as the
 * URL-parsing fallback (fed a scraped page's text) and for the "paste page
 * text" import path (fed exactly what the user pasted). Returns null when no
 * API key is configured or the model finds no recipe.
 */
export async function extractRecipeViaAI({ text, sourceUrl }: AiExtractOptions): Promise<ParsedRecipeData | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const userContent = sourceUrl ? `Page URL: ${sourceUrl}\n\nPage text:\n${text}` : `Pasted text:\n${text}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI extraction failed: HTTP ${res.status}`);

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content) as {
    title?: string | null;
    imageUrl?: string | null;
    ingredientLines?: string[];
    instructions?: string[];
  };
  if (!parsed.title || !Array.isArray(parsed.ingredientLines) || parsed.ingredientLines.length === 0) {
    return null;
  }
  return {
    title: parsed.title,
    sourceUrl: sourceUrl ?? '',
    imageUrl: parsed.imageUrl ?? undefined,
    ingredientLines: parsed.ingredientLines.filter((s) => typeof s === 'string' && s.trim()),
    instructions: Array.isArray(parsed.instructions)
      ? parsed.instructions.filter((s) => typeof s === 'string' && s.trim())
      : [],
  };
}
