import { create } from 'zustand';

import {
  createSplits as dbCreateSplits,
  deleteSplits as dbDeleteSplits,
  getSplitsForTrip,
  updateSplits as dbUpdateSplits,
  type CreateSplitInput,
} from '@/db/queries/expenseSplits';
import { deletePhoto as dbDeletePhoto } from '@/db/queries/expensePhotos';
import {
  createExpense as dbCreate,
  listExpensesForTrip,
  softDeleteExpense as dbSoftDelete,
  updateExpense as dbUpdate,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/db/queries/expenses';
import type { ExpensePhoto, ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';

interface UserShare {
  amount: number;
  convertedAmount: number;
  isParticipant: boolean;
}

interface ExpenseState {
  activeTripId: string | null;
  expenses: ExpenseWithPhotos[];
  splits: ExpenseSplit[];
  isLoading: boolean;
  error: string | null;
  loadForTrip: (tripId: string) => Promise<void>;
  refresh: () => Promise<void>;
  createExpense: (
    input: CreateExpenseInput,
    splits?: CreateSplitInput[] | null,
  ) => Promise<ExpenseWithPhotos>;
  updateExpense: (
    input: UpdateExpenseInput,
    splits?: CreateSplitInput[] | null,
  ) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  deletePhoto: (photo: ExpensePhoto) => Promise<void>;
  getUserShareForExpense: (expenseId: string, userId: string | null) => UserShare;
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
  splits: [],
  isLoading: false,
  error: null,

  loadForTrip: async (tripId) => {
    set({ activeTripId: tripId, isLoading: true, error: null });
    try {
      const [expenses, splits] = await Promise.all([
        listExpensesForTrip(tripId),
        getSplitsForTrip(tripId),
      ]);
      if (get().activeTripId !== tripId) return;
      set({ expenses, splits, isLoading: false });
    } catch (error) {
      console.warn('Failed to load expenses:', error);
      set({ error: 'Could not load expenses', isLoading: false });
    }
  },

  refresh: async () => {
    const tripId = get().activeTripId;
    if (!tripId) return;
    try {
      const [expenses, splits] = await Promise.all([
        listExpensesForTrip(tripId),
        getSplitsForTrip(tripId),
      ]);
      set({ expenses, splits, error: null });
    } catch (error) {
      console.warn('Failed to refresh expenses:', error);
      set({ error: 'Could not load expenses' });
    }
  },

  createExpense: async (input, splitsInput) => {
    const expense = await dbCreate(input);
    let createdSplits: ExpenseSplit[] = [];
    if (splitsInput && splitsInput.length > 0) {
      createdSplits = await dbCreateSplits(expense.id, splitsInput);
    }
    set((state) => {
      if (state.activeTripId !== input.tripId) return state;
      const nextExpense: ExpenseWithPhotos =
        createdSplits.length > 0 ? { ...expense, isSplit: true } : expense;
      return {
        expenses: sortExpenses([nextExpense, ...state.expenses]),
        splits: createdSplits.length > 0 ? [...state.splits, ...createdSplits] : state.splits,
      };
    });
    return expense;
  },

  updateExpense: async (input, splitsInput) => {
    const updated = await dbUpdate(input);
    let nextSplits: ExpenseSplit[] | null = null;
    if (splitsInput === null) {
      // Caller wants splits cleared.
      await dbDeleteSplits(updated.id);
      nextSplits = [];
    } else if (splitsInput && splitsInput.length > 0) {
      const newRows = await dbUpdateSplits(updated.id, splitsInput);
      nextSplits = newRows;
    }
    set((state) => {
      const updatedSplits =
        nextSplits === null
          ? state.splits
          : [
              ...state.splits.filter((s) => s.expenseId !== updated.id),
              ...nextSplits,
            ];
      const nextExpense: ExpenseWithPhotos = {
        ...updated,
        isSplit: nextSplits === null ? updated.isSplit : nextSplits.length > 0,
        photos:
          state.expenses.find((e) => e.id === updated.id)?.photos ?? [],
      };
      return {
        expenses: sortExpenses(
          state.expenses.map((e) => (e.id === updated.id ? nextExpense : e)),
        ),
        splits: updatedSplits,
      };
    });
  },

  deleteExpense: async (id) => {
    await dbSoftDelete(id);
    set((state) => ({
      expenses: state.expenses.filter((e) => e.id !== id),
      splits: state.splits.filter((s) => s.expenseId !== id),
    }));
  },

  deletePhoto: async (photo) => {
    await dbDeletePhoto(photo);
    set((state) => ({
      expenses: state.expenses.map((e) =>
        e.id === photo.expenseId
          ? { ...e, photos: e.photos.filter((p) => p.id !== photo.id) }
          : e,
      ),
    }));
  },

  getUserShareForExpense: (expenseId, userId) => {
    const state = get();
    const expense = state.expenses.find((e) => e.id === expenseId);
    if (!expense) {
      return { amount: 0, convertedAmount: 0, isParticipant: false };
    }
    if (!expense.isSplit) {
      return {
        amount: expense.amount,
        convertedAmount: expense.convertedAmount,
        isParticipant: true,
      };
    }
    if (!userId) {
      return {
        amount: expense.amount,
        convertedAmount: expense.convertedAmount,
        isParticipant: false,
      };
    }
    const userSplit = state.splits.find(
      (s) => s.expenseId === expenseId && s.userId === userId && s.deletedAt === null,
    );
    if (!userSplit) {
      // Split expense the user isn't part of — show full amount, mark non-participant.
      return {
        amount: expense.amount,
        convertedAmount: expense.convertedAmount,
        isParticipant: false,
      };
    }
    const ratio = expense.amount === 0 ? 0 : userSplit.amount / expense.amount;
    return {
      amount: userSplit.amount,
      convertedAmount: expense.convertedAmount * ratio,
      isParticipant: true,
    };
  },

  clear: () => set({ activeTripId: null, expenses: [], splits: [], error: null }),
}));
