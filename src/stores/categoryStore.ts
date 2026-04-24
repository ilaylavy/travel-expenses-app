import { create } from 'zustand';

import {
  createCategory as dbCreate,
  deleteCategoryIfEmpty as dbDelete,
  listAllCategories,
  reorderCategories as dbReorder,
  seedDefaultCategoriesIfNeeded,
  updateCategory as dbUpdate,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@/db/queries/categories';
import type { Category } from '@/types/category';

interface CategoryState {
  categories: Category[];
  isHydrated: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  createCategory: (input: CreateCategoryInput) => Promise<Category>;
  updateCategory: (input: UpdateCategoryInput) => Promise<Category>;
  reorderCategories: (orderedIds: string[]) => Promise<void>;
  deleteCategoryIfEmpty: (id: string) => Promise<boolean>;
  reset: () => void;
}

function byOrder(a: Category, b: Category): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt.localeCompare(b.createdAt);
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  isHydrated: false,
  error: null,

  hydrate: async () => {
    if (get().isHydrated) return;
    try {
      await seedDefaultCategoriesIfNeeded();
      const categories = await listAllCategories();
      set({ categories, isHydrated: true, error: null });
    } catch (error) {
      console.warn('Failed to hydrate category store:', error);
      set({ error: 'Could not load categories', isHydrated: true });
    }
  },

  refresh: async () => {
    try {
      const categories = await listAllCategories();
      set({ categories, error: null });
    } catch (error) {
      console.warn('Failed to refresh categories:', error);
      set({ error: 'Could not load categories' });
    }
  },

  createCategory: async (input) => {
    const category = await dbCreate(input);
    set((state) => ({ categories: [...state.categories, category].sort(byOrder) }));
    return category;
  },

  updateCategory: async (input) => {
    const updated = await dbUpdate(input);
    set((state) => ({
      categories: state.categories
        .map((c) => (c.id === updated.id ? updated : c))
        .sort(byOrder),
    }));
    return updated;
  },

  reorderCategories: async (orderedIds) => {
    await dbReorder(orderedIds);
    const index = new Map(orderedIds.map((id, i) => [id, i]));
    set((state) => ({
      categories: state.categories
        .map((c) => (index.has(c.id) ? { ...c, sortOrder: index.get(c.id) ?? c.sortOrder } : c))
        .sort(byOrder),
    }));
  },

  deleteCategoryIfEmpty: async (id) => {
    const deleted = await dbDelete(id);
    if (deleted) {
      set((state) => ({ categories: state.categories.filter((c) => c.id !== id) }));
    }
    return deleted;
  },

  reset: () => set({ categories: [], isHydrated: false, error: null }),
}));

// Helper selector: returns the effective list of categories for a given trip
// (global defaults + any trip-specific ones), sorted by scope then order.
export function selectCategoriesForTrip(
  all: Category[],
  tripId: string | null,
  options: { includeArchived?: boolean } = {},
): Category[] {
  return all
    .filter((c) => {
      if (!options.includeArchived && c.isArchived) return false;
      return c.tripId === null || c.tripId === tripId;
    })
    .sort(byOrder);
}
