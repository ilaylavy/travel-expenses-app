import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import type { PairwiseSettlement } from '@/utils/balance';

import {
  selectMySharedExpenses,
  selectOutstandingForUser,
  type SharedExpenseRow,
} from './balanceDisplay';

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

function split(overrides: Partial<ExpenseSplit>): ExpenseSplit {
  return {
    id: 's1',
    expenseId: 'e1',
    userId: 'u1',
    amount: 50,
    isPayer: false,
    createdAt: '2026-05-09T12:00:00Z',
    updatedAt: '2026-05-09T12:00:00Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('selectOutstandingForUser', () => {
  it('partitions grossDebts into youOwe (current user is debtor) and owesYou (current user is creditor)', () => {
    const grossDebts: PairwiseSettlement[] = [
      { fromUserId: 'u2', toUserId: 'u1', amount: 100 }, // u2 owes u1
      { fromUserId: 'u1', toUserId: 'u2', amount: 40 },  // u1 owes u2
      { fromUserId: 'u3', toUserId: 'u1', amount: 20 },  // u3 owes u1
      { fromUserId: 'u2', toUserId: 'u3', amount: 5 },   // unrelated to u1 — excluded
    ];
    const result = selectOutstandingForUser(grossDebts, 'u1');
    expect(result.youOwe).toEqual([
      { fromUserId: 'u1', toUserId: 'u2', amount: 40 },
    ]);
    expect(result.owesYou).toEqual([
      { fromUserId: 'u2', toUserId: 'u1', amount: 100 },
      { fromUserId: 'u3', toUserId: 'u1', amount: 20 },
    ]);
  });

  it('returns empty arrays when the user has no debts', () => {
    const result = selectOutstandingForUser([], 'u1');
    expect(result).toEqual({ youOwe: [], owesYou: [] });
  });
});

describe('selectMySharedExpenses', () => {
  it('returns one row per split expense the user participates in, newest first', () => {
    const e1 = expense({
      id: 'e1',
      userId: 'u1',
      amount: 100,
      convertedAmount: 100,
      isSplit: true,
      expenseDate: '2026-05-08',
    });
    const e2 = expense({
      id: 'e2',
      userId: 'u2',
      amount: 60,
      convertedAmount: 60,
      isSplit: true,
      expenseDate: '2026-05-10',
    });
    const splits: ExpenseSplit[] = [
      split({ id: 's1a', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
      split({ id: 's1b', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: false }),
      split({ id: 's2a', expenseId: 'e2', userId: 'u2', amount: 30, isPayer: true }),
      split({ id: 's2b', expenseId: 'e2', userId: 'u1', amount: 30, isPayer: false }),
    ];
    const rows = selectMySharedExpenses([e1, e2], splits, 'u1');
    expect(rows.map((r) => r.expense.id)).toEqual(['e2', 'e1']); // newest first
  });

  it('marks userIsPayer=true and lists each non-payer when user paid', () => {
    const e = expense({
      id: 'e1',
      userId: 'u1',
      amount: 90,
      convertedAmount: 90,
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u1', amount: 30, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u2', amount: 30, isPayer: false }),
      split({ id: 'sc', expenseId: 'e1', userId: 'u3', amount: 30, isPayer: false }),
    ];
    const [row] = selectMySharedExpenses([e], splits, 'u1');
    expect(row.userIsPayer).toBe(true);
    expect(row.payerUserId).toBe('u1');
    expect(row.userShareConverted).toBe(30);
    expect(row.otherNonPayers).toEqual([
      { userId: 'u2', shareConverted: 30 },
      { userId: 'u3', shareConverted: 30 },
    ]);
  });

  it('marks userIsPayer=false and stores user share when someone else paid', () => {
    const e = expense({
      id: 'e1',
      userId: 'u2',
      amount: 100,
      convertedAmount: 100,
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u2', amount: 60, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u1', amount: 40, isPayer: false }),
    ];
    const [row] = selectMySharedExpenses([e], splits, 'u1');
    expect(row.userIsPayer).toBe(false);
    expect(row.payerUserId).toBe('u2');
    expect(row.userShareConverted).toBe(40);
    expect(row.otherNonPayers).toEqual([]);
  });

  it('excludes deleted, private, and non-split expenses', () => {
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u2', amount: 50 }),
    ];
    const rows = selectMySharedExpenses(
      [
        expense({ id: 'e1', isSplit: true, deletedAt: '2026-05-10', userId: 'u1' }),
        expense({ id: 'e2', isSplit: true, isPrivate: true, userId: 'u1' }),
        expense({ id: 'e3', isSplit: false, userId: 'u1' }),
      ],
      splits,
      'u1',
    );
    expect(rows).toEqual([]);
  });

  it('excludes expenses where the current user has no active split', () => {
    const e = expense({
      id: 'e1',
      userId: 'u2',
      amount: 100,
      convertedAmount: 100,
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u3', amount: 50 }),
      // No split for u1
    ];
    const rows = selectMySharedExpenses([e], splits, 'u1');
    expect(rows).toEqual([]);
  });

  it('ignores deleted splits when deciding participation and amounts', () => {
    const e = expense({
      id: 'e1',
      userId: 'u1',
      amount: 100,
      convertedAmount: 100,
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u2', amount: 50, deletedAt: '2026-05-10' }),
    ];
    const rows = selectMySharedExpenses([e], splits, 'u1');
    // Only u1's split is active; expense effectively has no non-payers from u1's view.
    expect(rows[0].otherNonPayers).toEqual([]);
  });

  it('converts shares to home currency using the expense ratio', () => {
    // 9000 JPY total = 90 USD home; ratio test: u2's 6000 JPY share = 60 USD.
    const e = expense({
      id: 'e1',
      userId: 'u1',
      amount: 9000,
      convertedAmount: 90,
      currency: 'JPY',
      isSplit: true,
    });
    const splits: ExpenseSplit[] = [
      split({ id: 'sa', expenseId: 'e1', userId: 'u1', amount: 3000, isPayer: true }),
      split({ id: 'sb', expenseId: 'e1', userId: 'u2', amount: 6000, isPayer: false }),
    ];
    const [row] = selectMySharedExpenses([e], splits, 'u1');
    expect(row.userShareConverted).toBe(30);
    expect(row.otherNonPayers).toEqual([{ userId: 'u2', shareConverted: 60 }]);
  });
});
