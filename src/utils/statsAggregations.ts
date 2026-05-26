import type { ExpenseSplit, ExpenseWithPhotos, PaymentMethod } from '@/types/expense';
import type { SettlementPayment } from '@/types/settlement';
import type { Trip } from '@/types/trip';
import { computeBalance } from '@/utils/balance';
import { roundAmount } from '@/utils/currency';
import { isValidIsoDate } from '@/utils/date';
import { expandExpense } from '@/utils/expenseGrouping';
import { userShareConverted } from '@/utils/share';

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

export interface TopExpense {
  expense: ExpenseWithPhotos;
  userShareConverted: number;
}

export interface TripStats {
  // The caller's personal share total (in home currency). Sum of their
  // share across every active expense — see src/utils/share.ts.
  totalSpent: number;
  // Trip-wide spend (sum of full converted amounts). Drives the budget
  // pill so "remaining" stays meaningful in shared trips.
  tripTotalSpent: number;
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
  topExpenses: TopExpense[];
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

export interface AggregateInput {
  expenses: ExpenseWithPhotos[];
  splits: ExpenseSplit[];
  trip: Trip;
  today: string;
  // The caller's user id. All amount-based stats are weighted by this
  // user's share (see src/utils/share.ts) — solo trips collapse to the
  // legacy full-amount behaviour because share == full amount when the
  // caller is the only payer.
  currentUserId: string | null;
  // Optional. Recorded debt-settlement events. Feeds into the split-balance
  // calculation so the displayed pairwise debt reflects what's still owed
  // after payments. Has no effect on totals, by-day, by-category, or
  // by-payment-method — settlements aren't spending.
  settlementPayments?: SettlementPayment[];
  // Optional period window. When set, narrows the period-sensitive stats
  // (totalSpent, dailyAverage, byCategory, byDay, byPaymentMethod,
  // topExpenses) to expenses dated within [periodFrom, periodTo]. The
  // budget block (tripTotalSpent, budgetHome, budgetRemaining,
  // safeDailySpend) stays trip-wide regardless — a 7-day view shouldn't
  // change what fraction of the trip budget has been used.
  // Falls back to trip start/end when omitted.
  periodFrom?: string;
  periodTo?: string;
}

export function aggregate({
  expenses,
  splits,
  trip,
  today,
  currentUserId,
  settlementPayments,
  periodFrom,
  periodTo,
}: AggregateInput): TripStats {
  const active = expenses.filter((e) => e.deletedAt === null);

  // Index the caller's split rows by expenseId for O(1) lookup. Only the
  // caller's row matters here — other members' rows feed computeBalance.
  const callerSplitsByExpense = new Map<string, ExpenseSplit>();
  if (currentUserId) {
    for (const s of splits) {
      if (s.deletedAt !== null) continue;
      if (s.userId !== currentUserId) continue;
      callerSplitsByExpense.set(s.expenseId, s);
    }
  }

  const shareOf = (e: ExpenseWithPhotos): number =>
    userShareConverted(e, callerSplitsByExpense.get(e.id), currentUserId);

  // ----- Period window -----
  // When the caller passes a period (Last 7d / Last 30d on the Stats
  // screen), we restrict the totals to expenses dated within that
  // window. When neither bound is passed (trip mode — the default), we
  // intentionally do NOT filter by date at all: pre-refactor behavior
  // counted every active expense in totalSpent, including future-dated
  // entries within the trip range AND any out-of-range entries the user
  // may have logged. Preserving that matches the design's "Total · this
  // trip" expectation: the hero shows everything the trip owns.
  const tripEnd = trip.endDate
    ? trip.endDate
    : today < trip.startDate
      ? trip.startDate
      : today;
  const isPeriodMode = periodFrom !== undefined || periodTo !== undefined;
  const windowFrom = isPeriodMode
    ? clampIso(periodFrom ?? trip.startDate, trip.startDate, tripEnd)
    : trip.startDate;
  const windowTo = isPeriodMode
    ? clampIso(periodTo ?? tripEnd, trip.startDate, tripEnd)
    : tripEnd;
  // axisTo bounds the chart's upper end to today. The byDay chart only
  // draws bars for days that have happened; pre-logged future expenses
  // belong to totalSpent but don't render on the chart.
  const axisTo = clampIso(today, windowFrom, windowTo);
  const windowed = isPeriodMode
    ? active.filter((e) => e.expenseDate >= windowFrom && e.expenseDate <= windowTo)
    : active;

  // ----- Totals -----
  // tripTotalSpent: sum of full amounts across the whole trip (drives the
  //   budget block — period filter doesn't affect what's been spent vs
  //   the user's total trip budget).
  // totalSpent:     caller's personal share. In trip mode this is the
  //   full active set; in period mode it's the windowed subset.
  let tripTotalSpent = 0;
  for (const e of active) tripTotalSpent += e.convertedAmount;
  tripTotalSpent = roundAmount(tripTotalSpent);

  let totalSpent = 0;
  for (const e of windowed) totalSpent += shareOf(e);
  totalSpent = roundAmount(totalSpent);

  // ----- Daily average / by-day (exclude daily-excluded, expand spreads) -----
  // Spread expenses: the share is the caller's full-expense share divided
  // evenly across the spread's day count, mirroring how expandExpense
  // splits the per-day converted amount.
  const dailyContributing = windowed.filter((e) => !e.isExcludedFromDailyMetrics);
  const byDayMap = new Map<string, number>();
  for (const e of dailyContributing) {
    const fullShare = shareOf(e);
    const slices = expandExpense(e);
    const perSliceShare = slices.length > 0 ? fullShare / slices.length : fullShare;
    for (const slice of slices) {
      const key = slice.displayExpense.expenseDate;
      // Chart only collects slices that fall within [windowFrom, axisTo]
      // — past-or-today within the period window. Future slices belong
      // to totalSpent (above), not to the chart.
      if (key < windowFrom || key > axisTo) continue;
      byDayMap.set(key, (byDayMap.get(key) ?? 0) + perSliceShare);
    }
  }

  // daysElapsed counts days that have happened in the window (start to
  // axisTo). Drives dailyAverage. A future-only window collapses to one
  // day so the divisor stays sane.
  const daysElapsed = isValidIsoDate(windowFrom) && isValidIsoDate(axisTo)
    ? Math.max(1, inclusiveDayCount(windowFrom, axisTo))
    : 1;

  const byDay: DailyTotal[] = [];
  if (isValidIsoDate(windowFrom) && isValidIsoDate(axisTo)) {
    const span = inclusiveDayCount(windowFrom, axisTo);
    for (let i = 0; i < span; i += 1) {
      const date = addDaysIso(windowFrom, i);
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

  // ----- Budget (personal) -----
  // Each member sets their own budget on trip_members (in home_currency).
  // Trip.budget is the active user's budget — compare against the caller's
  // TRIP-wide share so the remaining number reflects their own situation
  // across the whole trip, not just the selected period.
  let tripTotalShare = 0;
  for (const e of active) tripTotalShare += shareOf(e);
  tripTotalShare = roundAmount(tripTotalShare);

  let budgetHome: number | null = null;
  let budgetRemaining: number | null = null;
  let safeDailySpend: number | null = null;
  if (trip.budget !== null && trip.budget > 0) {
    budgetHome = trip.budget;
    budgetRemaining = roundAmount(budgetHome - tripTotalShare);
    if (daysRemaining !== null && daysRemaining > 0) {
      safeDailySpend = roundAmount(budgetRemaining / daysRemaining);
    }
  }

  // ----- By category (caller's share, include daily-excluded) -----
  const categoryMap = new Map<string, number>();
  for (const e of windowed) {
    const share = shareOf(e);
    if (share === 0) continue;
    categoryMap.set(e.categoryId, (categoryMap.get(e.categoryId) ?? 0) + share);
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

  // ----- By payment method (caller's share, attributed to the actual method
  // used at purchase time even when the caller is just a participant) -----
  const paymentMap = new Map<PaymentMethodBucket, number>();
  for (const e of windowed) {
    const bucket = toPaymentBucket(e.paymentMethod);
    if (bucket === null) continue;
    const share = shareOf(e);
    if (share === 0) continue;
    paymentMap.set(bucket, (paymentMap.get(bucket) ?? 0) + share);
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

  // ----- By member + settlement (split-aware) -----
  // Each member's share = sum of their split rows + sum of non-split expenses
  // they paid for. Settlement is netted pairwise across split debts and
  // reduced by any recorded settlement payments.
  // Private expenses are excluded (the logger's own cost).
  const balance = computeBalance({ expenses: active, splits, settlementPayments });
  const byMember: MemberTotal[] = balance.byMember.map((m) => ({
    userId: m.userId,
    total: m.total,
  }));
  // Stats UI consumes a single `Settlement` for 2-member trips. computeBalance
  // returns all non-zero pairs; for the MVP card we surface the largest one.
  const settlement: Settlement | null = balance.settlements[0] ?? null;

  // ----- Top expenses (caller's view — only expenses the caller actually
  // contributed to, sorted by their share). Period-windowed. -----
  const topExpenses: TopExpense[] = windowed
    .filter((e) => !e.isRefund)
    .map((e) => ({ expense: e, userShareConverted: shareOf(e) }))
    .filter((t) => Math.abs(t.userShareConverted) >= 0.01)
    .sort((a, b) => Math.abs(b.userShareConverted) - Math.abs(a.userShareConverted))
    .slice(0, 5);

  return {
    totalSpent,
    tripTotalSpent,
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
