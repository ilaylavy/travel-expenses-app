import { useEffect, useRef } from 'react';

import type { ExpenseWithPhotos } from '@/types/expense';

interface UseExpenseFocusProps {
  focusExpenseId?: string | null;
  allExpenses: ExpenseWithPhotos[];
  focusExpense: (target: ExpenseWithPhotos) => void;
  onPressExpense: (expense: ExpenseWithPhotos) => void;
  onFocusHandled?: () => void;
}

/**
 * Handles focusing a specific expense on the map when passed via a URL prop
 * or deep link. It identifies the target expense by ID, opens the map popup
 * via `onPressExpense`, and reports the completed focus back to the router
 * via `onFocusHandled`.
 */
export function useExpenseFocus({
  focusExpenseId,
  allExpenses,
  focusExpense,
  onPressExpense,
  onFocusHandled,
}: UseExpenseFocusProps) {
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
