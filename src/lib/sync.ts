import { getSupabaseClient } from './supabase';
import { useAuthUserStore, useRecipeStore } from './stores';
import type { Ingredient, MealType, Recipe } from './types';

/** Entities that can be independently deleted and need a tombstone row. */
export type SyncEntity = 'recipe';

const TABLE_BY_ENTITY: Record<SyncEntity, string> = {
  recipe: 'recipes',
};

function currentUserId(): string | null {
  return useAuthUserStore.getState().userId;
}

/**
 * Pure last-write-wins comparator: whichever of `local`/`remote` has the
 * later `updatedAt` wins; a value with no counterpart always wins by
 * default. Ties (including two undefined `updatedAt`s) favor `local`, so a
 * pull that finds nothing has actually changed doesn't churn the store.
 *
 * This governs *client-side* decisions about what to pull into the local
 * store vs. push back up — it is not the source of truth for who wins a
 * genuine two-device race. That's decided server-side: every table's
 * `updated_at` is set by a Postgres trigger (see supabase/schema.sql), never
 * trusted from the client, so whichever write actually reaches the database
 * last is authoritative regardless of either device's clock. A stale local
 * comparison here just means one extra push/pull round-trip to converge —
 * not silently-wrong data.
 */
export function resolveLastWriteWins<T extends { updatedAt?: string }>(
  local: T | undefined,
  remote: T | undefined,
): T | undefined {
  if (!local) return remote;
  if (!remote) return local;
  return (remote.updatedAt ?? '') > (local.updatedAt ?? '') ? remote : local;
}

// --- Recipes ---------------------------------------------------------------

interface RecipeRow {
  id: string;
  title: string;
  source_url: string;
  image_url: string | null;
  ingredients: Ingredient[];
  instructions: string[];
  date_added: string;
  meal_types: MealType[] | null;
  category: string | null;
  main_ingredient: string | null;
  cook_time_minutes: number | null;
  updated_at: string;
}

function rowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url,
    imageUrl: row.image_url ?? undefined,
    ingredients: row.ingredients,
    instructions: row.instructions,
    dateAdded: row.date_added,
    mealTypes: row.meal_types ?? undefined,
    category: row.category ?? undefined,
    mainIngredient: row.main_ingredient ?? undefined,
    cookTimeMinutes: row.cook_time_minutes ?? undefined,
    updatedAt: row.updated_at,
  };
}

function recipeToRow(userId: string, recipe: Recipe) {
  return {
    user_id: userId,
    id: recipe.id,
    title: recipe.title,
    source_url: recipe.sourceUrl,
    image_url: recipe.imageUrl ?? null,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    date_added: recipe.dateAdded,
    meal_types: recipe.mealTypes ?? null,
    category: recipe.category ?? null,
    main_ingredient: recipe.mainIngredient ?? null,
    cook_time_minutes: recipe.cookTimeMinutes ?? null,
    // updated_at is intentionally omitted — the server trigger sets it.
  };
}

/**
 * Upserts one recipe to Supabase. Best-effort and fire-and-forget by design
 * — the local write already succeeded by the time callers reach this, so a
 * network failure here is never surfaced as an error; it just means this
 * change goes out on the next successful pull/push instead.
 */
export async function pushRecipe(recipe: Recipe): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  try {
    await supabase.from('recipes').upsert(recipeToRow(userId, recipe));
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

/** Deletes a recipe remotely and records a tombstone so other devices drop it too. Best-effort, same as `pushRecipe`. */
export async function deleteRemote(entity: SyncEntity, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  const table = TABLE_BY_ENTITY[entity];
  try {
    await Promise.all([
      supabase.from(table).delete().eq('user_id', userId).eq('id', id),
      supabase.from('deleted_records').upsert({ user_id: userId, entity, record_id: id }),
    ]);
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

/**
 * Reconciles the local recipe collection with Supabase: pulls remote
 * additions/edits that are newer than the local copy, pushes local
 * additions/edits the server doesn't have yet, and applies any tombstones
 * newer than the local copy. Best-effort — a failed fetch just leaves things
 * as they are until the next pull.
 */
export async function pullRecipes(): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;

  let rows: RecipeRow[] | null;
  let tombstoneRows: { record_id: string; deleted_at: string }[] | null;
  try {
    const [recipesResult, tombstonesResult] = await Promise.all([
      supabase.from('recipes').select('*').eq('user_id', userId),
      supabase
        .from('deleted_records')
        .select('record_id, deleted_at')
        .eq('user_id', userId)
        .eq('entity', 'recipe'),
    ]);
    if (recipesResult.error || tombstonesResult.error) return;
    rows = recipesResult.data as RecipeRow[] | null;
    tombstoneRows = tombstonesResult.data;
  } catch {
    return; // Offline or unreachable — try again on the next pull.
  }

  const remoteById = new Map((rows ?? []).map((row) => [row.id, rowToRecipe(row)]));
  const deletedAt = new Map<string, string>(
    (tombstoneRows ?? []).map((t) => [t.record_id, t.deleted_at]),
  );

  const { recipes: localRecipes, addRecipe, removeRecipe } = useRecipeStore.getState();
  const allIds = new Set([...Object.keys(localRecipes), ...remoteById.keys()]);

  for (const id of allIds) {
    const local = localRecipes[id];
    const remote = remoteById.get(id);
    const tombstoneTime = deletedAt.get(id);

    if (
      tombstoneTime &&
      (!local?.updatedAt || tombstoneTime >= local.updatedAt) &&
      (!remote || tombstoneTime >= (remote.updatedAt ?? ''))
    ) {
      if (local) removeRecipe(id);
      continue;
    }

    const winner = resolveLastWriteWins(local, remote);
    if (!winner) continue;
    if (winner === remote && winner !== local) {
      addRecipe(winner);
    } else if (winner === local && winner !== remote) {
      void pushRecipe(winner);
    }
  }
}

/** Runs every entity's pull. Only recipes sync so far — more join in as each lands. */
export async function pullAll(): Promise<void> {
  await pullRecipes();
}
