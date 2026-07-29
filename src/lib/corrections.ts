import type { Ingredient } from './types';
import { normalizeIngredientName } from './normalize';

/**
 * Corrections — the parser learning from being told it was wrong.
 *
 * Everything the parser knows is a vocabulary someone wrote down: the synonym
 * map, the unit aliases, the aisle keywords, the identity modifiers. All of it
 * is data, and all of it currently only changes when the code does. This is
 * the same vocabulary, extendable from the outside.
 *
 * Two shapes, and the difference matters more than it looks:
 *
 *   - A **line** correction fixes one exact string. Narrow, certain, and it
 *     only ever helps with that line again.
 *   - A **name** correction says two things are the same thing, or that a name
 *     is simply wrong. It applies to lines nobody has seen yet, including
 *     recipes imported next year. This is the one that compounds.
 *
 * Neither is consulted by anyone else's copy of the app. A correction changes
 * the collection of whoever made it and nothing further; sharing one submits
 * it for review, it doesn't publish it.
 */

export interface Correction {
  id: string;
  /** 'line' fixes one exact original string; 'name' fixes a name wherever it appears. */
  kind: 'line' | 'name';
  /**
   * What to match on. The raw ingredient line for 'line', the normalized name
   * the parser produced for 'name'.
   */
  match: string;
  /** What the parser produced, kept so a report says what was actually wrong. */
  got: ParsedFields;
  /** What it should have produced. Fields left out are taken from `got`. */
  expected: Partial<ParsedFields>;
  createdAt: string;
  /**
   * Whether this may be submitted for review. Off unless explicitly turned on
   * — a correction is about a recipe someone is cooking.
   */
  share: boolean;
  /** Set once submitted, so it isn't sent twice. */
  submittedAt?: string;
}

export interface ParsedFields {
  name: string;
  quantity: number;
  unit: string;
}

export const parsedFieldsOf = (ing: Ingredient): ParsedFields => ({
  name: ing.name,
  quantity: ing.quantity,
  unit: ing.unit,
});

/** Match keys are compared loosely — a recipe's capitalisation isn't meaningful. */
const keyOf = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Both lookups a parse needs, built once per parse run rather than per line.
 *
 * A map rather than a scan because `reparseAllRecipes` walks every line of
 * every recipe, and this sits inside that loop.
 */
export interface CorrectionIndex {
  byLine: Map<string, Correction>;
  byName: Map<string, Correction>;
  size: number;
}

export function indexCorrections(corrections: Correction[]): CorrectionIndex {
  const byLine = new Map<string, Correction>();
  const byName = new Map<string, Correction>();
  for (const c of corrections) {
    // Later corrections win: being told twice means the first answer was wrong.
    (c.kind === 'line' ? byLine : byName).set(keyOf(c.match), c);
  }
  return { byLine, byName, size: byLine.size + byName.size };
}

export const EMPTY_INDEX: CorrectionIndex = indexCorrections([]);

/**
 * Applies whichever correction fits, or returns the ingredient untouched.
 *
 * Line first: it's the more specific statement, and someone who corrected an
 * exact line meant that line. A corrected name still goes through
 * `normalizeIngredientName`, so "Catsup" and "catsup" can't become two rows —
 * the correction joins the vocabulary rather than bypassing it.
 */
export function applyCorrection(ing: Ingredient, index: CorrectionIndex): Ingredient {
  if (index.size === 0) return ing;
  const correction =
    index.byLine.get(keyOf(ing.originalString)) ?? index.byName.get(keyOf(ing.name));
  if (!correction) return ing;

  const { name, quantity, unit } = correction.expected;
  return {
    ...ing,
    ...(name !== undefined ? { name: normalizeIngredientName(name) } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
    ...(unit !== undefined ? { unit } : {}),
    correctedBy: correction.id,
  };
}

/**
 * A correction as a line for `tests/fixtures/ingredient-lines.tsv`.
 *
 * The point of the whole exercise: a real case someone hit becomes a case the
 * parser is held to forever. Tab-separated, same shape the corpus reader
 * expects, so a reviewed report is paste-ready.
 */
export function asCorpusLine(correction: Correction): string {
  const expected = { ...correction.got, ...correction.expected };
  const line = correction.kind === 'line' ? correction.match : correction.got.name;
  return [line, expected.quantity, expected.unit, normalizeIngredientName(expected.name)].join(
    '\t',
  );
}
