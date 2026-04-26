import type { ExpenseWithPhotos } from '@/types/expense';
import { isValidIsoDate, todayIsoDate } from '@/utils/date';

export type DateLabelKind = 'today' | 'yesterday' | 'date';

// Optional override that returns the user's share for an expense. When
// provided, list amounts and daily subtotals are computed from the share
// instead of the full expense amount.
export interface UserShareForExpense {
  amount: number;
  convertedAmount: number;
}
export type UserShareGetter = (expenseId: string) => UserShareForExpense | null;

// A single row rendered in the expense list. Non-spread expenses produce one
// item; multi-day spreads produce one item per day with `displayExpense`
// carrying the per-day share. The original `expense` always references the
// underlying record so edits/deletes operate on the full entry.
export interface ExpenseListItem {
  key: string;
  expense: ExpenseWithPhotos;
  displayExpense: ExpenseWithPhotos;
  isSpreadSlice: boolean;
  sliceIndex: number;
  sliceCount: number;
  // The current user's per-row share in trip currency (and home currency).
  // Equals displayExpense.amount/convertedAmount unless the expense is split.
  userShareAmount: number;
  userShareConverted: number;
}

export interface ExpenseDateGroup {
  key: string;
  date: string;
  kind: DateLabelKind;
  // Net subtotal in home currency across all list items on this date.
  subtotal: number;
  data: ExpenseListItem[];
}

function yesterdayIsoDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  const diff = isoToUtc(endIso) - isoToUtc(startIso);
  return Math.round(diff / MS_PER_DAY) + 1;
}

function singleItem(
  e: ExpenseWithPhotos,
  shareAmount: number,
  shareConverted: number,
): ExpenseListItem {
  return {
    key: `${e.id}:single`,
    expense: e,
    displayExpense: e,
    isSpreadSlice: false,
    sliceIndex: 0,
    sliceCount: 1,
    userShareAmount: shareAmount,
    userShareConverted: shareConverted,
  };
}

export function expandExpense(
  e: ExpenseWithPhotos,
  getShare?: UserShareGetter,
): ExpenseListItem[] {
  const share = getShare?.(e.id) ?? null;
  const totalShareAmount = share ? share.amount : e.amount;
  const totalShareConverted = share ? share.convertedAmount : e.convertedAmount;

  const start = e.spreadStartDate;
  const end = e.spreadEndDate;
  if (
    !start ||
    !end ||
    !isValidIsoDate(start) ||
    !isValidIsoDate(end) ||
    end < start
  ) {
    return [singleItem(e, totalShareAmount, totalShareConverted)];
  }

  const count = inclusiveDayCount(start, end);
  // A same-day spread has no reason to split.
  if (count <= 1) return [singleItem(e, totalShareAmount, totalShareConverted)];

  const perAmount = e.amount / count;
  const perConverted = e.convertedAmount / count;
  const perShareAmount = totalShareAmount / count;
  const perShareConverted = totalShareConverted / count;
  const slices: ExpenseListItem[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = addDaysIso(start, i);
    slices.push({
      key: `${e.id}:${date}`,
      expense: e,
      displayExpense: {
        ...e,
        amount: perAmount,
        convertedAmount: perConverted,
        expenseDate: date,
      },
      isSpreadSlice: true,
      sliceIndex: i,
      sliceCount: count,
      userShareAmount: perShareAmount,
      userShareConverted: perShareConverted,
    });
  }
  return slices;
}

// Groups expenses by displayed date, expanding multi-day spreads into per-day
// slices with evenly-divided amounts. Returns groups sorted by date desc.
// When `getShare` is provided, daily subtotals and per-row shares reflect the
// current user's share rather than the full expense amount.
export function groupExpensesByDate(
  expenses: ExpenseWithPhotos[],
  getShare?: UserShareGetter,
): ExpenseDateGroup[] {
  const today = todayIsoDate();
  const yesterday = yesterdayIsoDate();

  const buckets = new Map<string, ExpenseListItem[]>();
  for (const e of expenses) {
    for (const item of expandExpense(e, getShare)) {
      const date = item.displayExpense.expenseDate;
      const list = buckets.get(date);
      if (list) list.push(item);
      else buckets.set(date, [item]);
    }
  }

  const groups: ExpenseDateGroup[] = [];
  for (const [date, data] of buckets) {
    let subtotal = 0;
    for (const item of data) subtotal += item.userShareConverted;
    const kind: DateLabelKind =
      date === today ? 'today' : date === yesterday ? 'yesterday' : 'date';
    groups.push({ key: date, date, kind, subtotal, data });
  }

  groups.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return groups;
}
