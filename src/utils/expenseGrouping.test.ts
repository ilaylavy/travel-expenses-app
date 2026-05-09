import type { ExpenseWithPhotos } from '@/types/expense';

import { expandExpense, groupExpensesByDate } from './expenseGrouping';

function expense(overrides: Partial<ExpenseWithPhotos>): ExpenseWithPhotos {
  return {
    id: 'e1',
    tripId: 't1',
    userId: 'u1',
    amount: 100,
    currency: 'USD',
    convertedAmount: 100,
    exchangeRate: 1,
    categoryId: 'c1',
    note: null,
    paymentMethod: null,
    latitude: null,
    longitude: null,
    placeName: null,
    expenseDate: '2026-05-09',
    expenseTime: '12:00:00',
    isRefund: false,
    isExcludedFromDailyMetrics: false,
    isPrivate: false,
    isSplit: false,
    spreadStartDate: null,
    spreadEndDate: null,
    createdAt: '2026-05-09T12:00:00Z',
    updatedAt: '2026-05-09T12:00:00Z',
    deletedAt: null,
    photos: [],
    ...overrides,
  };
}

describe('expandExpense', () => {
  it('returns a single item for non-spread expenses', () => {
    const items = expandExpense(expense({ id: 'e1', amount: 60, convertedAmount: 60 }));
    expect(items).toHaveLength(1);
    expect(items[0].sliceCount).toBe(1);
    expect(items[0].userShareAmount).toBe(60);
    expect(items[0].userShareConverted).toBe(60);
  });

  it('expands a spread into per-day slices with even amounts', () => {
    const items = expandExpense(
      expense({
        id: 'e1',
        amount: 100,
        convertedAmount: 200,
        spreadStartDate: '2026-05-09',
        spreadEndDate: '2026-05-12',
      }),
    );
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.displayExpense.expenseDate)).toEqual([
      '2026-05-09',
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
    ]);
    items.forEach((i) => {
      expect(i.isSpreadSlice).toBe(true);
      expect(i.sliceCount).toBe(4);
      expect(i.displayExpense.amount).toBeCloseTo(25);
      expect(i.displayExpense.convertedAmount).toBeCloseTo(50);
    });
  });

  it('falls back to a single item when spread dates are invalid', () => {
    const items = expandExpense(
      expense({
        id: 'e1',
        spreadStartDate: 'not a date',
        spreadEndDate: 'also not a date',
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].isSpreadSlice).toBe(false);
  });

  it('uses the share getter when provided', () => {
    const items = expandExpense(
      expense({ id: 'e1', amount: 100, convertedAmount: 100, isSplit: true }),
      () => ({ amount: 30, convertedAmount: 30 }),
    );
    expect(items[0].userShareAmount).toBe(30);
    expect(items[0].userShareConverted).toBe(30);
  });
});

describe('groupExpensesByDate', () => {
  it('groups by displayed date and sums home-currency subtotals', () => {
    const groups = groupExpensesByDate([
      expense({ id: 'e1', expenseDate: '2026-05-09', convertedAmount: 30 }),
      expense({ id: 'e2', expenseDate: '2026-05-09', convertedAmount: 40 }),
      expense({ id: 'e3', expenseDate: '2026-05-08', convertedAmount: 25 }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-05-09', '2026-05-08']);
    expect(groups[0].subtotal).toBe(70);
    expect(groups[1].subtotal).toBe(25);
  });

  it('expands multi-day spreads into one item per day', () => {
    const groups = groupExpensesByDate([
      expense({
        id: 'e1',
        amount: 100,
        convertedAmount: 100,
        expenseDate: '2026-05-09',
        spreadStartDate: '2026-05-09',
        spreadEndDate: '2026-05-11',
      }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.date).sort()).toEqual([
      '2026-05-09',
      '2026-05-10',
      '2026-05-11',
    ]);
    groups.forEach((g) => expect(g.subtotal).toBeCloseTo(100 / 3));
  });

  it('returns groups sorted newest-first', () => {
    const groups = groupExpensesByDate([
      expense({ id: 'e1', expenseDate: '2026-05-08' }),
      expense({ id: 'e2', expenseDate: '2026-05-12' }),
      expense({ id: 'e3', expenseDate: '2026-05-10' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual([
      '2026-05-12',
      '2026-05-10',
      '2026-05-08',
    ]);
  });

  it('uses the share getter for subtotals', () => {
    const groups = groupExpensesByDate(
      [
        expense({ id: 'e1', expenseDate: '2026-05-09', convertedAmount: 100, isSplit: true }),
      ],
      () => ({ amount: 25, convertedAmount: 25 }),
    );
    expect(groups[0].subtotal).toBe(25);
  });
});
