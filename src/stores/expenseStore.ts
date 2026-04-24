import { create } from 'zustand';

import {
  createExpense as dbCreate,
  listExpensesForTrip,
  softDeleteExpense as dbSoftDelete,
  updateExpense as dbUpdate,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/db/queries/expenses';
import type { ExpenseWithPhotos } from '@/types/expense';

interface ExpenseState {
  activeTripId: string | null;
  expenses: ExpenseWithPhotos[];
  isLoading: boolean;
  error: string | null;
  loadForTrip: (tripId: string) => Promise<void>;
  refresh: () => Promise<void>;
  createExpense: (input: CreateExpenseInput) => Promise<ExpenseWithPhotos>;
  updateExpense: (input: UpdateExpenseInput) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  clear: () => void;
}

function sortExpenses(expenses: ExpenseWithPhotos[]): ExpenseWithPhotos[] {
  return [...expenses].sort((a, b) => {
    if (a.expenseDate !== b.expenseDate) return a.expenseDate < b.expenseDate ? 1 : -1;
    if (a.expenseTime !== b.expenseTime) return a.expenseTime < b.expenseTime ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  activeTripId: null,
  expenses: [],
  isLoading: false,
  error: null,

  loadForTrip: async (tripId) => {
    set({ activeTripId: tripId, isLoading: true, error: null });
    try {
      const expenses = await listExpensesForTrip(tripId);
      if (get().activeTripId !== tripId) return;
      set({ expenses, isLoading: false });
    } catch (error) {
      console.warn('Failed to load expenses:', error);
      set({ error: 'Could not load expenses', isLoading: false });
    }
  },

  refresh: async () => {
    const tripId = get().activeTripId;
    if (!tripId) return;
    try {
      const expenses = await listExpensesForTrip(tripId);
      set({ expenses, error: null });
    } catch (error) {
      console.warn('Failed to refresh expenses:', error);
      set({ error: 'Could not load expenses' });
    }
  },

  createExpense: async (input) => {
    const expense = await dbCreate(input);
    set((state) => {
      if (state.activeTripId !== input.tripId) return state;
      return { expenses: sortExpenses([expense, ...state.expenses]) };
    });
    return expense;
  },

  updateExpense: async (input) => {
    const updated = await dbUpdate(input);
    set((state) => ({
      expenses: sortExpenses(
        state.expenses.map((e) =>
          e.id === updated.id ? { ...updated, photos: e.photos } : e,
        ),
      ),
    }));
  },

  deleteExpense: async (id) => {
    await dbSoftDelete(id);
    set((state) => ({ expenses: state.expenses.filter((e) => e.id !== id) }));
  },

  clear: () => set({ activeTripId: null, expenses: [], error: null }),
}));
