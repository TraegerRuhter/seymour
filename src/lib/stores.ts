'use client';

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import localforage from 'localforage';
import type {
  MealPlanConfig,
  MealPlanDay,
  Recipe,
  ShoppingListItem,
} from './types';

/**
 * IndexedDB-backed storage for zustand's persist middleware.
 * On the server (SSR pass) a no-op storage keeps imports safe.
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
    },
  ),
);

// --- Meal Plan ---

interface PlanState {
  config: MealPlanConfig | null;
  plan: MealPlanDay[] | null;
  hasHydrated: boolean;
  setPlan: (config: MealPlanConfig, plan: MealPlanDay[]) => void;
  clearPlan: () => void;
  setSlot: (dayIndex: number, mealIndex: number, recipeId: string) => void;
  clearRecipeFromPlan: (recipeId: string) => void;
  replaceAll: (config: MealPlanConfig | null, plan: MealPlanDay[] | null) => void;
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      config: null,
      plan: null,
      hasHydrated: false,
      setPlan: (config, plan) => set({ config, plan }),
      clearPlan: () => set({ config: null, plan: null }),
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
      replaceAll: (config, plan) => set({ config, plan }),
    }),
    {
      name: 'meal-plan',
      storage: createJSONStorage(() => makeStorage('meal_plan')),
      partialize: (s) => ({ config: s.config, plan: s.plan }),
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
    },
  ),
);

// --- Hydration tracking ---
// Persist rehydrates asynchronously from IndexedDB; pages gate rendering on
// this so persisted state never flashes in as empty.

const hydrationFlags = { recipes: false, plan: false, shopping: false };

function markHydrated(key: keyof typeof hydrationFlags, store: { setState: (s: { hasHydrated: boolean }) => void }) {
  hydrationFlags[key] = true;
  store.setState({ hasHydrated: true });
}

if (typeof window !== 'undefined') {
  useRecipeStore.persist.onFinishHydration(() => markHydrated('recipes', useRecipeStore));
  usePlanStore.persist.onFinishHydration(() => markHydrated('plan', usePlanStore));
  useShoppingStore.persist.onFinishHydration(() => markHydrated('shopping', useShoppingStore));
  // If rehydration already finished before listeners attached:
  if (useRecipeStore.persist.hasHydrated()) markHydrated('recipes', useRecipeStore);
  if (usePlanStore.persist.hasHydrated()) markHydrated('plan', usePlanStore);
  if (useShoppingStore.persist.hasHydrated()) markHydrated('shopping', useShoppingStore);
}

/** True once all three stores have rehydrated from IndexedDB. */
export function useAllHydrated(): boolean {
  const a = useRecipeStore((s) => s.hasHydrated);
  const b = usePlanStore((s) => s.hasHydrated);
  const c = useShoppingStore((s) => s.hasHydrated);
  return a && b && c;
}
