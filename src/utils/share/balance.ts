import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';

// Single source of truth for "what is this user's share of this expense?".
// Used by the expense list, the stats aggregator, and the expense store
// selector — keeping them in lock-step across the whole app.
//
//   - Non-split, user paid       → full e.amount / e.convertedAmount
//   - Non-split, user didn't pay → 0
//   - Split, user has a row      → es.amount (trip currency) and a
//                                  proportionally converted home amount
//   - Split, user has no row     → 0 (decision #8 of the splits plan —
//                                  user isn't a participant; no share)
//
// When userId is null (logged-out edge case during render), fall back to
// the full amount so callers don't show zeros until auth rehydrates.

export function userShareConverted(
  expense: ExpenseWithPhotos,
  userSplit: ExpenseSplit | undefined,
  userId: string | null,
): number {
  if (!userId) return expense.convertedAmount;
  if (!expense.isSplit) {
    return expense.userId === userId ? expense.convertedAmount : 0;
  }
  if (!userSplit) return 0;
  const ratio = expense.amount === 0 ? 0 : userSplit.amount / expense.amount;
  return expense.convertedAmount * ratio;
}

export function userShareTrip(
  expense: ExpenseWithPhotos,
  userSplit: ExpenseSplit | undefined,
  userId: string | null,
): number {
  if (!userId) return expense.amount;
  if (!expense.isSplit) {
    return expense.userId === userId ? expense.amount : 0;
  }
  return userSplit?.amount ?? 0;
}
