'use client';

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import localforage from 'localforage';
import type {
  ArchivedPlan,
  MealPlanConfig,
  MealPlanDay,
  Recipe,
  ShoppingListItem,
} from './types';
import type { UnitSystem } from './units';

/**
 * IndexedDB-backed storage for zustand's persist middleware.
 * On the server (SSR pass) a no-op storage keeps imports safe.
 *
 * Versioning: every persist() below carries an explicit `version` and
 * `migrate`. This matters because of how zustand's persist middleware
 * behaves on a version mismatch — if `migrate` isn't provided, it doesn't
 * keep the old data around, it silently discards it and falls back to the
 * store's default initial state. Concretely: bump `version` the moment a
 * store's shape changes (a field is renamed, restructured, or made
 * non-optional) *and* extend `migrate` to transform every prior version
 * forward, or every existing user's saved recipes/plan/list vanish the next
 * time they open the app. Purely additive optional fields are the one case
 * that's safe to skip a bump for, since old data simply won't have the key
 * and consuming code already needs to treat it as optional.
 */
function makeStorage(storeName: string): StateStorage {
  if (typeof window === 'undefined') {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  const instance = localforage.createInstance({
    name: 'seymour',
    storeName,
  });
  return {
    getItem: (key) => instance.getItem<string>(key),
    setItem: (key, value) => instance.setItem(key, value).then(() => {}),
    removeItem: (key) => instance.removeItem(key),
  };
}

// --- Recipes ---

interface RecipeState {
  recipes: Record<string, Recipe>;
  hasHydrated: boolean;
  addRecipe: (recipe: Recipe) => void;
  addRecipes: (recipes: Recipe[]) => void;
  updateRecipe: (recipe: Recipe) => void;
  removeRecipe: (id: string) => void;
  replaceAll: (recipes: Record<string, Recipe>) => void;
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set) => ({
      recipes: {},
      hasHydrated: false,
      addRecipe: (recipe) =>
        set((s) => ({ recipes: { ...s.recipes, [recipe.id]: recipe } })),
      addRecipes: (list) =>
        set((s) => {
          const next = { ...s.recipes };
          for (const r of list) next[r.id] = r;
          return { recipes: next };
        }),
      updateRecipe: (recipe) =>
        set((s) => ({ recipes: { ...s.recipes, [recipe.id]: recipe } })),
      removeRecipe: (id) =>
        set((s) => {
          const next = { ...s.recipes };
          delete next[id];
          return { recipes: next };
        }),
      replaceAll: (recipes) => set({ recipes }),
    }),
    {
      name: 'recipes',
      storage: createJSONStorage(() => makeStorage('recipes')),
      partialize: (s) => ({ recipes: s.recipes }),
      version: 1,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<{ recipes: Record<string, Recipe> }>;
        return { recipes: s.recipes ?? {} };
      },
    },
  ),
);

// --- Meal Plan ---

interface PlanState {
  config: MealPlanConfig | null;
  plan: MealPlanDay[] | null;
  archivedPlans: ArchivedPlan[];
  hasHydrated: boolean;
  setPlan: (config: MealPlanConfig, plan: MealPlanDay[]) => void;
  clearPlan: () => void;
  setSlot: (dayIndex: number, mealIndex: number, recipeId: string) => void;
  clearRecipeFromPlan: (recipeId: string) => void;
  /** Adds an entry to the archive (most recent first). */
  pushArchived: (entry: ArchivedPlan) => void;
  deleteArchived: (id: string) => void;
  clearArchived: () => void;
  replaceAll: (
    config: MealPlanConfig | null,
    plan: MealPlanDay[] | null,
    archivedPlans?: ArchivedPlan[],
  ) => void;
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      config: null,
      plan: null,
      archivedPlans: [],
      hasHydrated: false,
      setPlan: (config, plan) => set({ config, plan }),
      clearPlan: () => set({ config: null, plan: null }),
      pushArchived: (entry) =>
        set((s) => ({ archivedPlans: [entry, ...s.archivedPlans] })),
      deleteArchived: (id) =>
        set((s) => ({ archivedPlans: s.archivedPlans.filter((a) => a.id !== id) })),
      clearArchived: () => set({ archivedPlans: [] }),
      setSlot: (dayIndex, mealIndex, recipeId) =>
        set((s) => {
          if (!s.plan) return s;
          const plan = s.plan.map((day, di) =>
            di !== dayIndex
              ? day
              : {
                  ...day,
                  meals: day.meals.map((m, mi) =>
                    mi !== mealIndex ? m : { ...m, recipeId },
                  ),
                },
          );
          return { plan };
        }),
      clearRecipeFromPlan: (recipeId) =>
        set((s) => {
          if (!s.plan) return s;
          const plan = s.plan.map((day) => ({
            ...day,
            meals: day.meals.map((m) =>
              m.recipeId === recipeId ? { ...m, recipeId: '' } : m,
            ),
          }));
          return { plan };
        }),
      replaceAll: (config, plan, archivedPlans) =>
        set((s) => ({ config, plan, archivedPlans: archivedPlans ?? s.archivedPlans })),
    }),
    {
      name: 'meal-plan',
      storage: createJSONStorage(() => makeStorage('meal_plan')),
      partialize: (s) => ({ config: s.config, plan: s.plan, archivedPlans: s.archivedPlans }),
      version: 1,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<{
          config: MealPlanConfig | null;
          plan: MealPlanDay[] | null;
          archivedPlans: ArchivedPlan[];
        }>;
        return {
          config: s.config ?? null,
          plan: s.plan ?? null,
          archivedPlans: s.archivedPlans ?? [],
        };
      },
    },
  ),
);

// --- Shopping List ---

interface ShoppingState {
  items: ShoppingListItem[];
  hasHydrated: boolean;
  setItems: (items: ShoppingListItem[]) => void;
  toggleChecked: (id: string) => void;
  setOverride: (id: string, text: string) => void;
  clearChecked: () => void;
  replaceAll: (items: ShoppingListItem[]) => void;
}

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set) => ({
      items: [],
      hasHydrated: false,
      setItems: (items) => set({ items }),
      toggleChecked: (id) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...i, checked: !i.checked } : i,
          ),
        })),
      setOverride: (id, text) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id
              ? { ...i, manualOverride: text.trim() || undefined }
              : i,
          ),
        })),
      clearChecked: () =>
        set((s) => ({
          items: s.items.map((i) => ({ ...i, checked: false })),
        })),
      replaceAll: (items) => set({ items }),
    }),
    {
      name: 'shopping-list',
      storage: createJSONStorage(() => makeStorage('shopping_list')),
      partialize: (s) => ({ items: s.items }),
      version: 1,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<{ items: ShoppingListItem[] }>;
        return { items: s.items ?? [] };
      },
    },
  ),
);

// --- Pantry staples ("spice rack") ---

interface PantryState {
  /** Normalized ingredient names (see normalizeIngredientName) the user already has on hand. */
  staples: string[];
  hasHydrated: boolean;
  addStaple: (name: string) => void;
  removeStaple: (name: string) => void;
  replaceAll: (staples: string[]) => void;
}

export const usePantryStore = create<PantryState>()(
  persist(
    (set) => ({
      staples: [],
      hasHydrated: false,
      addStaple: (name) =>
        set((s) => (s.staples.includes(name) ? s : { staples: [...s.staples, name].sort() })),
      removeStaple: (name) =>
        set((s) => ({ staples: s.staples.filter((n) => n !== name) })),
      replaceAll: (staples) => set({ staples }),
    }),
    {
      name: 'pantry',
      storage: createJSONStorage(() => makeStorage('pantry')),
      partialize: (s) => ({ staples: s.staples }),
      version: 1,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<{ staples: string[] }>;
        return { staples: s.staples ?? [] };
      },
    },
  ),
);

// --- Signed-in user id (session-only, not persisted) ---
//
// Mirrors Supabase's own session state so plain functions outside React
// (actions.ts, sync.ts) can read "who's signed in right now" via
// `useAuthUserStore.getState()`, the same way they already read every other
// store — without needing to be hooks themselves. `AuthProvider` is the only
// writer.

interface AuthUserState {
  userId: string | null;
  setUserId: (userId: string | null) => void;
}

export const useAuthUserStore = create<AuthUserState>((set) => ({
  userId: null,
  setUserId: (userId) => set({ userId }),
}));

// --- Settings ---

interface SettingsState {
  unitSystem: UnitSystem;
  hasHydrated: boolean;
  setUnitSystem: (system: UnitSystem) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      unitSystem: 'imperial',
      hasHydrated: false,
      setUnitSystem: (unitSystem) => set({ unitSystem }),
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => makeStorage('settings')),
      partialize: (s) => ({ unitSystem: s.unitSystem }),
      version: 1,
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<{ unitSystem: UnitSystem }>;
        return { unitSystem: s.unitSystem ?? 'imperial' };
      },
    },
  ),
);

// --- Hydration tracking ---
// Persist rehydrates asynchronously from IndexedDB; pages gate rendering on
// this so persisted state never flashes in as empty.

const hydrationFlags = { recipes: false, plan: false, shopping: false, settings: false, pantry: false };

function markHydrated(key: keyof typeof hydrationFlags, store: { setState: (s: { hasHydrated: boolean }) => void }) {
  hydrationFlags[key] = true;
  store.setState({ hasHydrated: true });
}

if (typeof window !== 'undefined') {
  useRecipeStore.persist.onFinishHydration(() => markHydrated('recipes', useRecipeStore));
  usePlanStore.persist.onFinishHydration(() => markHydrated('plan', usePlanStore));
  useShoppingStore.persist.onFinishHydration(() => markHydrated('shopping', useShoppingStore));
  useSettingsStore.persist.onFinishHydration(() => markHydrated('settings', useSettingsStore));
  usePantryStore.persist.onFinishHydration(() => markHydrated('pantry', usePantryStore));
  // If rehydration already finished before listeners attached:
  if (useRecipeStore.persist.hasHydrated()) markHydrated('recipes', useRecipeStore);
  if (usePlanStore.persist.hasHydrated()) markHydrated('plan', usePlanStore);
  if (useShoppingStore.persist.hasHydrated()) markHydrated('shopping', useShoppingStore);
  if (useSettingsStore.persist.hasHydrated()) markHydrated('settings', useSettingsStore);
  if (usePantryStore.persist.hasHydrated()) markHydrated('pantry', usePantryStore);
}

/** True once all stores have rehydrated from IndexedDB. */
export function useAllHydrated(): boolean {
  const a = useRecipeStore((s) => s.hasHydrated);
  const b = usePlanStore((s) => s.hasHydrated);
  const c = useShoppingStore((s) => s.hasHydrated);
  const d = useSettingsStore((s) => s.hasHydrated);
  const e = usePantryStore((s) => s.hasHydrated);
  return a && b && c && d && e;
}