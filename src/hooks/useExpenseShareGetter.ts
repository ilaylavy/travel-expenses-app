import { useCallback } from 'react';

import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';

// Returns a getter that, for split expenses, computes the current user's
// share of the trip-currency and home-currency amounts. Non-split expenses
// return null (so callers can fall back to the full amount). For split
// expenses where the user has no row, returns 0/0 — they shouldn't be
// counted toward subtotals (the SPLIT badge conveys "not your cost").
export function useExpenseShareGetter({
  expenses,
  splits,
  currentUserId,
}: {
  expenses: ExpenseWithPhotos[];
  splits: ExpenseSplit[];
  currentUserId: string | null;
}) {
  return useCallback(
    (expenseId: string): { amount: number; convertedAmount: number } | null => {
      const expense = expenses.find((e) => e.id === expenseId);
      if (!expense || !expense.isSplit) return null;
      const userSplit = splits.find(
        (s) =>
          s.expenseId === expenseId &&
          s.userId === currentUserId &&
          s.deletedAt === null,
      );
      if (!userSplit) {
        return { amount: 0, convertedAmount: 0 };
      }
      const ratio = expense.amount === 0 ? 0 : userSplit.amount / expense.amount;
      return {
        amount: userSplit.amount,
        convertedAmount: expense.convertedAmount * ratio,
      };
    },
    [expenses, splits, currentUserId],
  );
}
