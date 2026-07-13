import { getSupabaseClient } from './supabase';
import {
  useAuthUserStore,
  usePantryStore,
  usePlanStore,
  useRecipeStore,
  useSettingsStore,
  useShoppingStore,
} from './stores';
import type {
  ArchivedPlan,
  Ingredient,
  MealPlanConfig,
  MealPlanDay,
  MealType,
  Recipe,
  ShoppingListItem,
} from './types';
import type { UnitSystem } from './units';

/** Entities that can be independently deleted and need a tombstone row. */
export type SyncEntity = 'recipe' | 'archived_plan';

const TABLE_BY_ENTITY: Record<SyncEntity, string> = {
  recipe: 'recipes',
  archived_plan: 'archived_plans',
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

// --- Shopping list item check-state -----------------------------------

interface ShoppingItemStateRow {
  id: string;
  checked: boolean;
  manual_override: string | null;
  updated_at: string;
}

interface CheckState {
  checked: boolean;
  manualOverride?: string;
  updatedAt?: string;
}

/**
 * Upserts one item's checked/manualOverride state. Only that state syncs —
 * quantities and ingredient names are recomputed locally from the plan,
 * recipes, and pantry staples, never sent over the wire (see the comment on
 * the `shopping_list_items` table in supabase/schema.sql).
 */
export async function pushShoppingItemState(item: ShoppingListItem): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  try {
    await supabase.from('shopping_list_items').upsert({
      user_id: userId,
      id: item.id,
      checked: item.checked,
      manual_override: item.manualOverride ?? null,
    });
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

/**
 * Merges remote checked/manualOverride state into the current local
 * shopping list, per item id. Never pulls item existence or quantities —
 * those come from each device's own buildShoppingList() re-derivation, so
 * two devices with the same plan/recipes/staples arrive at the same items
 * independently, without a network round trip.
 */
export async function pullShoppingItemStates(): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;

  let rows: ShoppingItemStateRow[] | null;
  try {
    const result = await supabase.from('shopping_list_items').select('*').eq('user_id', userId);
    if (result.error) return;
    rows = result.data;
  } catch {
    return;
  }

  const remoteById = new Map<string, CheckState>(
    (rows ?? []).map((row) => [
      row.id,
      { checked: row.checked, manualOverride: row.manual_override ?? undefined, updatedAt: row.updated_at },
    ]),
  );

  const { items, setItems } = useShoppingStore.getState();
  let changed = false;
  const merged = items.map((item) => {
    const localState: CheckState = {
      checked: item.checked,
      manualOverride: item.manualOverride,
      updatedAt: item.updatedAt,
    };
    const remoteState = remoteById.get(item.id);
    const winner = resolveLastWriteWins(localState, remoteState);

    if (winner === remoteState && remoteState) {
      changed = true;
      return {
        ...item,
        checked: remoteState.checked,
        manualOverride: remoteState.manualOverride,
        updatedAt: remoteState.updatedAt,
      };
    }
    if (winner === localState && (!remoteState || (item.updatedAt ?? '') > (remoteState.updatedAt ?? ''))) {
      void pushShoppingItemState(item);
    }
    return item;
  });
  if (changed) setItems(merged);
}

// --- Meal plan: config + per-day rows -----------------------------------

interface MealPlanConfigRow {
  days: number;
  meal_types: MealType[];
  seed: number;
  updated_at: string;
}

interface MealPlanDayRow {
  day_index: number;
  date: string;
  meals: MealPlanDay['meals'];
  updated_at: string;
}

function rowToConfig(row: MealPlanConfigRow): MealPlanConfig {
  return { days: row.days, mealTypes: row.meal_types, seed: row.seed, updatedAt: row.updated_at };
}

function configToRow(userId: string, config: MealPlanConfig) {
  return { user_id: userId, days: config.days, meal_types: config.mealTypes, seed: config.seed };
}

function rowToDay(row: MealPlanDayRow): MealPlanDay {
  return { date: row.date, meals: row.meals, updatedAt: row.updated_at };
}

function dayToRow(userId: string, dayIndex: number, day: MealPlanDay) {
  return { user_id: userId, day_index: dayIndex, date: day.date, meals: day.meals };
}

export async function pushMealPlanConfig(config: MealPlanConfig): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  try {
    await supabase.from('meal_plan_config').upsert(configToRow(userId, config));
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

export async function pushMealPlanDay(dayIndex: number, day: MealPlanDay): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  try {
    await supabase.from('meal_plan_days').upsert(dayToRow(userId, dayIndex, day));
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

/**
 * Pushes a full regenerate: the new config plus every day, and drops any
 * remote days beyond the new plan's length (a shorter regenerate shouldn't
 * leave stale trailing days for a pull to resurrect later).
 */
async function trimMealPlanDaysFrom(fromIndex: number): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  try {
    await supabase.from('meal_plan_days').delete().eq('user_id', userId).gte('day_index', fromIndex);
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

export async function pushMealPlan(config: MealPlanConfig, plan: MealPlanDay[]): Promise<void> {
  await Promise.all([
    pushMealPlanConfig(config),
    ...plan.map((day, i) => pushMealPlanDay(i, day)),
    trimMealPlanDaysFrom(plan.length),
  ]);
}

/**
 * Deletes the remote meal plan entirely (used when the local plan is
 * archived or cleared). No tombstone — the next device to generate a new
 * plan just pushes fresh rows. A device that's offline with a stale local
 * plan at the moment this runs can re-upload it on reconnect; accepted as an
 * edge case rather than adding a second conflict-resolution mechanism just
 * for "was this plan deliberately cleared."
 */
export async function clearMealPlanRemote(): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  try {
    await Promise.all([
      supabase.from('meal_plan_config').delete().eq('user_id', userId),
      supabase.from('meal_plan_days').delete().eq('user_id', userId),
    ]);
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

/**
 * Reconciles the local meal plan with Supabase. The config (day count, meal
 * types, seed) is compared first: if the server's is newer, a full
 * regenerate happened on another device and a differently-shaped plan can't
 * be sensibly merged day-by-day, so the whole remote plan replaces the
 * local one. Otherwise the config hasn't changed on either side — regular
 * regeneration didn't touch it — so days merge individually, which is what
 * lets a slot swap on one device and a different day's swap on another both
 * survive.
 */
export async function pullMealPlan(): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;

  let configRow: MealPlanConfigRow | null;
  let dayRows: MealPlanDayRow[] | null;
  try {
    const [configResult, daysResult] = await Promise.all([
      supabase.from('meal_plan_config').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('meal_plan_days').select('*').eq('user_id', userId).order('day_index'),
    ]);
    if (configResult.error || daysResult.error) return;
    configRow = configResult.data;
    dayRows = daysResult.data;
  } catch {
    return;
  }

  const { config: localConfig, plan: localPlan, setPlan, setDay } = usePlanStore.getState();
  const remoteConfig = configRow ? rowToConfig(configRow) : undefined;
  const remoteDaysByIndex = new Map((dayRows ?? []).map((row) => [row.day_index, rowToDay(row)]));

  if (!localConfig || !localPlan) {
    if (remoteConfig && remoteDaysByIndex.size > 0) {
      const days = [...remoteDaysByIndex.entries()].sort(([a], [b]) => a - b).map(([, day]) => day);
      setPlan(remoteConfig, days);
    }
    return;
  }

  const configWinner = resolveLastWriteWins(localConfig, remoteConfig);

  if (configWinner === remoteConfig && remoteConfig) {
    const days = [...remoteDaysByIndex.entries()].sort(([a], [b]) => a - b).map(([, day]) => day);
    setPlan(remoteConfig, days);
    return;
  }

  if (!remoteConfig) {
    void pushMealPlan(localConfig, localPlan);
    return;
  }

  localPlan.forEach((localDay, index) => {
    const remoteDay = remoteDaysByIndex.get(index);
    const winner = resolveLastWriteWins(localDay, remoteDay);
    if (winner === remoteDay && remoteDay) {
      setDay(index, remoteDay);
    } else if (winner === localDay && (!remoteDay || (localDay.updatedAt ?? '') > (remoteDay.updatedAt ?? ''))) {
      void pushMealPlanDay(index, localDay);
    }
  });
}

// --- Archived plans (immutable once created) ------------------------------

interface ArchivedPlanRow {
  id: string;
  archived_at: string;
  label: string;
  config: MealPlanConfig;
  plan: MealPlanDay[];
}

function rowToArchivedPlan(row: ArchivedPlanRow): ArchivedPlan {
  return { id: row.id, archivedAt: row.archived_at, label: row.label, config: row.config, plan: row.plan };
}

function archivedPlanToRow(userId: string, entry: ArchivedPlan) {
  return {
    user_id: userId,
    id: entry.id,
    archived_at: entry.archivedAt,
    label: entry.label,
    config: entry.config,
    plan: entry.plan,
  };
}

/** Upserts one archived plan. Archived plans are immutable once created, so this only ever fires once per entry. */
export async function pushArchivedPlan(entry: ArchivedPlan): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  try {
    await supabase.from('archived_plans').upsert(archivedPlanToRow(userId, entry));
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

/**
 * Adopts remote archived plans the local device doesn't have yet (skipping
 * anything tombstoned as deleted), and pushes local ones the server doesn't
 * have. No content merging needed — an archived plan never changes after
 * creation, so existence plus tombstones is the whole story.
 */
export async function pullArchivedPlans(): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;

  let rows: ArchivedPlanRow[] | null;
  let tombstoneRows: { record_id: string }[] | null;
  try {
    const [plansResult, tombstonesResult] = await Promise.all([
      supabase.from('archived_plans').select('*').eq('user_id', userId),
      supabase.from('deleted_records').select('record_id').eq('user_id', userId).eq('entity', 'archived_plan'),
    ]);
    if (plansResult.error || tombstonesResult.error) return;
    rows = plansResult.data;
    tombstoneRows = tombstonesResult.data;
  } catch {
    return;
  }

  const deletedIds = new Set((tombstoneRows ?? []).map((t) => t.record_id));
  const { archivedPlans: local, pushArchived } = usePlanStore.getState();
  const localIds = new Set(local.map((a) => a.id));
  const remoteIds = new Set((rows ?? []).map((r) => r.id));

  for (const row of rows ?? []) {
    if (deletedIds.has(row.id) || localIds.has(row.id)) continue;
    pushArchived(rowToArchivedPlan(row));
  }

  for (const entry of local) {
    if (!deletedIds.has(entry.id) && !remoteIds.has(entry.id)) {
      void pushArchivedPlan(entry);
    }
  }
}

// --- Pantry staples: whole list, one row per user -------------------------

interface PantryRow {
  staples: string[];
  updated_at: string;
}

interface WholeBlobState {
  updatedAt?: string;
}

/** Upserts the entire staples list. Low edit frequency and low conflict risk made per-staple rows not worth the extra table — see supabase/schema.sql. */
export async function pushPantryStaples(staples: string[]): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  try {
    await supabase.from('pantry_staples').upsert({ user_id: userId, staples });
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

export async function pullPantryStaples(): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;

  let row: PantryRow | null;
  try {
    const result = await supabase.from('pantry_staples').select('*').eq('user_id', userId).maybeSingle();
    if (result.error) return;
    row = result.data;
  } catch {
    return;
  }

  const { staples, updatedAt, replaceAll } = usePantryStore.getState();
  const localState: WholeBlobState = { updatedAt: updatedAt ?? undefined };
  const remoteState: WholeBlobState | undefined = row ? { updatedAt: row.updated_at } : undefined;
  const winner = resolveLastWriteWins(localState, remoteState);

  if (winner === remoteState && row) {
    replaceAll(row.staples, row.updated_at);
  } else if (winner === localState && (!remoteState || (updatedAt ?? '') > (remoteState.updatedAt ?? ''))) {
    void pushPantryStaples(staples);
  }
}

// --- Settings: whole blob, one row per user -------------------------------

interface SettingsRow {
  unit_system: UnitSystem;
  updated_at: string;
}

export async function pushSettings(unitSystem: UnitSystem): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;
  try {
    await supabase.from('settings').upsert({ user_id: userId, unit_system: unitSystem });
  } catch {
    // Offline or unreachable — nothing to do until the next sync attempt.
  }
}

export async function pullSettings(): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return;

  let row: SettingsRow | null;
  try {
    const result = await supabase.from('settings').select('*').eq('user_id', userId).maybeSingle();
    if (result.error) return;
    row = result.data;
  } catch {
    return;
  }

  const { unitSystem, updatedAt, setUnitSystem } = useSettingsStore.getState();
  const localState: WholeBlobState = { updatedAt: updatedAt ?? undefined };
  const remoteState: WholeBlobState | undefined = row ? { updatedAt: row.updated_at } : undefined;
  const winner = resolveLastWriteWins(localState, remoteState);

  if (winner === remoteState && row) {
    setUnitSystem(row.unit_system, row.updated_at);
  } else if (winner === localState && (!remoteState || (updatedAt ?? '') > (remoteState.updatedAt ?? ''))) {
    void pushSettings(unitSystem);
  }
}

/** Runs every entity's pull. More entities join in as each lands. */
export async function pullAll(): Promise<void> {
  await Promise.all([
    pullRecipes(),
    pullShoppingItemStates(),
    pullMealPlan(),
    pullArchivedPlans(),
    pullPantryStaples(),
    pullSettings(),
  ]);
}

// --- Realtime -------------------------------------------------------------

const SYNCED_TABLES = [
  'recipes',
  'shopping_list_items',
  'meal_plan_config',
  'meal_plan_days',
  'archived_plans',
  'pantry_staples',
  'settings',
  'deleted_records',
] as const;

let realtimePullTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRealtimePull(): void {
  if (realtimePullTimer) clearTimeout(realtimePullTimer);
  realtimePullTimer = setTimeout(() => {
    realtimePullTimer = null;
    void pullAll();
  }, 500);
}

/**
 * Subscribes to live Postgres changes for the signed-in user's rows across
 * every synced table, so a change made on one device shows up on another
 * without waiting for the next app-foreground pull. A burst of writes (e.g.
 * a full plan regenerate touching many meal_plan_days rows at once)
 * triggers one debounced re-pull, not one per row.
 *
 * The device that made a change also receives its own event back and
 * re-pulls too — harmless, since pulling is idempotent, but not filtered
 * out; doing so would mean tracking a per-client id purely to skip one
 * redundant no-op fetch.
 *
 * Returns an unsubscribe function — call it when the caller unmounts or the
 * user signs out. A no-op subscription (whose unsubscribe does nothing) is
 * returned when accounts aren't configured or no one is signed in.
 */
export function subscribeRealtime(): () => void {
  const supabase = getSupabaseClient();
  const userId = currentUserId();
  if (!supabase || !userId) return () => {};

  const channel = supabase.channel(`sync:${userId}`);
  for (const table of SYNCED_TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
      scheduleRealtimePull,
    );
  }
  channel.subscribe();

  return () => {
    if (realtimePullTimer) {
      clearTimeout(realtimePullTimer);
      realtimePullTimer = null;
    }
    void supabase.removeChannel(channel);
  };
}
