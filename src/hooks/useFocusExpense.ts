import { useEffect, useRef } from 'react';

import type { ExpenseWithPhotos } from '@/types/expense';

export function useFocusExpense({
  focusExpenseId,
  allExpenses,
  focusExpense,
  onPressExpense,
  onFocusHandled,
}: {
  focusExpenseId?: string | null;
  allExpenses: ExpenseWithPhotos[];
  focusExpense: (target: ExpenseWithPhotos) => void;
  onPressExpense: (expense: ExpenseWithPhotos) => void;
  onFocusHandled?: () => void;
}) {
  const focusHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusExpenseId) return;
    if (focusHandledRef.current === focusExpenseId) return;
    const target = allExpenses.find((e) => e.id === focusExpenseId);
    if (!target) return;
    if (target.latitude == null || target.longitude == null) {
      focusHandledRef.current = focusExpenseId;
      onFocusHandled?.();
      return;
    }
    focusExpense(target);
    onPressExpense(target);
    focusHandledRef.current = focusExpenseId;
    onFocusHandled?.();
  }, [focusExpenseId, allExpenses, focusExpense, onPressExpense, onFocusHandled]);
}
