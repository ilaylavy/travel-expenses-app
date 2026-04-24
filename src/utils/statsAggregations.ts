import type { ExpenseWithPhotos, PaymentMethod } from '@/types/expense';
import type { Trip } from '@/types/trip';
import { roundAmount } from '@/utils/currency';
import { isValidIsoDate } from '@/utils/date';
import { expandExpense } from '@/utils/expenseGrouping';

export type PaymentMethodBucket = 'cash' | 'credit' | 'debit' | 'other';

export interface CategoryTotal {
  categoryId: string;
  total: number;
  percent: number;
}

export interface DailyTotal {
  date: string;
  total: number;
}

export interface PaymentTotal {
  method: PaymentMethodBucket;
  total: number;
  percent: number;
}

export interface MemberTotal {
  userId: string;
  total: number;
}

export interface Settlement {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface TripStats {
  totalSpent: number;
  dailyAverage: number;
  daysElapsed: number;
  daysRemaining: number | null;
  budgetHome: number | null;
  budgetRemaining: number | null;
  safeDailySpend: number | null;
  byCategory: CategoryTotal[];
  byDay: DailyTotal[];
  byPaymentMethod: PaymentTotal[];
  byMember: MemberTotal[];
  topExpenses: ExpenseWithPhotos[];
  settlement: Settlement | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDaysIso(iso: string, n: number): string {
  const next = new Date(isoToUtc(iso) + n * MS_PER_DAY);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function inclusiveDayCount(startIso: string, endIso: string): number {
  return Math.round((isoToUtc(endIso) - isoToUtc(startIso)) / MS_PER_DAY) + 1;
}

function clampIso(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

function toPaymentBucket(method: PaymentMethod | null): PaymentMethodBucket | null {
  if (method === null) return null;
  if (method === 'cash' || method === 'credit' || method === 'debit') return method;
  return 'other';
}

// Convert the trip's budget (stored in baseCurrency) into home currency by
// averaging the stored exchange rates of expenses that match the base→home
// direction. If there are no cross-currency expenses we fall back to 1:1.
function convertBudgetToHome(
  budget: number,
  trip: Trip,
  expenses: ExpenseWithPhotos[],
): number {
  if (trip.baseCurrency === trip.homeCurrency) return budget;
  let sum = 0;
  let count = 0;
  for (const e of expenses) {
    if (e.deletedAt !== null) continue;
    if (e.currency !== trip.baseCurrency) continue;
    if (e.amount === 0) continue;
    const ratio = e.convertedAmount / e.amount;
    if (!Number.isFinite(ratio)) continue;
    sum += ratio;
    count += 1;
  }
  if (count === 0) return budget;
  return roundAmount(budget * (sum / count));
}

export interface AggregateInput {
  expenses: ExpenseWithPhotos[];
  trip: Trip;
  today: string;
}

export function aggregate({ expenses, trip, today }: AggregateInput): TripStats {
  const active = expenses.filter((e) => e.deletedAt === null);

  // ----- Totals (include daily-excluded, include refunds as negatives) -----
  let totalSpent = 0;
  for (const e of active) totalSpent += e.convertedAmount;
  totalSpent = roundAmount(totalSpent);

  // ----- Daily average / by-day (exclude daily-excluded, expand spreads) -----
  const dailyContributing = active.filter((e) => !e.isExcludedFromDailyMetrics);
  const byDayMap = new Map<string, number>();
  for (const e of dailyContributing) {
    for (const slice of expandExpense(e)) {
      const key = slice.displayExpense.expenseDate;
      byDayMap.set(key, (byDayMap.get(key) ?? 0) + slice.displayExpense.convertedAmount);
    }
  }

  // Date window: every day from tripStart through min(today, tripEnd), even
  // days with zero spend, so the chart has a continuous axis.
  const effectiveEnd = (() => {
    if (!trip.endDate) return today < trip.startDate ? trip.startDate : today;
    return clampIso(today, trip.startDate, trip.endDate);
  })();
  const daysElapsed = isValidIsoDate(trip.startDate) && isValidIsoDate(effectiveEnd)
    ? Math.max(1, inclusiveDayCount(trip.startDate, effectiveEnd))
    : 1;

  const byDay: DailyTotal[] = [];
  if (isValidIsoDate(trip.startDate) && isValidIsoDate(effectiveEnd)) {
    const span = inclusiveDayCount(trip.startDate, effectiveEnd);
    for (let i = 0; i < span; i += 1) {
      const date = addDaysIso(trip.startDate, i);
      byDay.push({ date, total: roundAmount(byDayMap.get(date) ?? 0) });
    }
  }

  let dailyTotal = 0;
  for (const d of byDay) dailyTotal += d.total;
  const dailyAverage = roundAmount(dailyTotal / daysElapsed);

  // ----- Days remaining -----
  let daysRemaining: number | null = null;
  if (trip.endDate && isValidIsoDate(trip.endDate) && today <= trip.endDate) {
    // today counts as a day still in the trip, so +1 inclusive from tomorrow
    // is already captured by inclusiveDayCount(today, endDate).
    const start = today < trip.startDate ? trip.startDate : today;
    daysRemaining = Math.max(0, inclusiveDayCount(start, trip.endDate) - 1);
  }

  // ----- Budget -----
  let budgetHome: number | null = null;
  let budgetRemaining: number | null = null;
  let safeDailySpend: number | null = null;
  if (trip.budget !== null && trip.budget > 0) {
    budgetHome = convertBudgetToHome(trip.budget, trip, active);
    budgetRemaining = roundAmount(budgetHome - totalSpent);
    if (daysRemaining !== null && daysRemaining > 0) {
      safeDailySpend = roundAmount(budgetRemaining / daysRemaining);
    }
  }

  // ----- By category (full amount, include daily-excluded) -----
  const categoryMap = new Map<string, number>();
  for (const e of active) {
    categoryMap.set(e.categoryId, (categoryMap.get(e.categoryId) ?? 0) + e.convertedAmount);
  }
  const categoryAbsSum = Array.from(categoryMap.values()).reduce(
    (acc, v) => acc + Math.abs(v),
    0,
  );
  const byCategory: CategoryTotal[] = Array.from(categoryMap.entries())
    .filter(([, total]) => total !== 0)
    .map(([categoryId, total]) => ({
      categoryId,
      total: roundAmount(total),
      percent: categoryAbsSum === 0 ? 0 : (Math.abs(total) / categoryAbsSum) * 100,
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  // ----- By payment method -----
  const paymentMap = new Map<PaymentMethodBucket, number>();
  for (const e of active) {
    const bucket = toPaymentBucket(e.paymentMethod);
    if (bucket === null) continue;
    paymentMap.set(bucket, (paymentMap.get(bucket) ?? 0) + e.convertedAmount);
  }
  const paymentAbsSum = Array.from(paymentMap.values()).reduce(
    (acc, v) => acc + Math.abs(v),
    0,
  );
  const byPaymentMethod: PaymentTotal[] = Array.from(paymentMap.entries())
    .map(([method, total]) => ({
      method,
      total: roundAmount(total),
      percent: paymentAbsSum === 0 ? 0 : (Math.abs(total) / paymentAbsSum) * 100,
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  // ----- By member -----
  // Private expenses are the logger's own cost and are excluded from the split.
  const memberMap = new Map<string, number>();
  for (const e of active) {
    if (e.isPrivate) continue;
    memberMap.set(e.userId, (memberMap.get(e.userId) ?? 0) + e.convertedAmount);
  }
  const byMember: MemberTotal[] = Array.from(memberMap.entries())
    .map(([userId, total]) => ({ userId, total: roundAmount(total) }))
    .sort((a, b) => b.total - a.total);

  // ----- Settlement (only when exactly 2 members appear) -----
  let settlement: Settlement | null = null;
  if (byMember.length === 2) {
    const [a, b] = byMember;
    const diff = a.total - b.total;
    if (Math.abs(diff) >= 0.01) {
      settlement = {
        fromUserId: diff > 0 ? b.userId : a.userId,
        toUserId: diff > 0 ? a.userId : b.userId,
        amount: roundAmount(Math.abs(diff) / 2),
      };
    }
  }

  // ----- Top expenses (exclude refunds, sort by abs convertedAmount desc) -----
  const topExpenses = [...active]
    .filter((e) => !e.isRefund)
    .sort((a, b) => Math.abs(b.convertedAmount) - Math.abs(a.convertedAmount))
    .slice(0, 5);

  return {
    totalSpent,
    dailyAverage,
    daysElapsed,
    daysRemaining,
    budgetHome,
    budgetRemaining,
    safeDailySpend,
    byCategory,
    byDay,
    byPaymentMethod,
    byMember,
    topExpenses,
    settlement,
  };
}
