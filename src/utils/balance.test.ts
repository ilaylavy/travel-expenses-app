import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';

import { computeBalance } from './balance';

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

describe('computeBalance — non-split expenses', () => {
  it('attributes the full converted amount to the payer', () => {
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100 }),
        expense({ id: 'e2', userId: 'u2', amount: 40, convertedAmount: 40 }),
      ],
      splits: [],
    });
    expect(result.byMember).toEqual([
      { userId: 'u1', total: 100 },
      { userId: 'u2', total: 40 },
    ]);
    expect(result.settlements).toEqual([]);
  });

  it('skips deleted and private expenses', () => {
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100 }),
        expense({ id: 'e2', userId: 'u1', amount: 50, convertedAmount: 50, deletedAt: '2026-05-10' }),
        expense({ id: 'e3', userId: 'u2', amount: 25, convertedAmount: 25, isPrivate: true }),
      ],
      splits: [],
    });
    expect(result.byMember).toEqual([{ userId: 'u1', total: 100 }]);
  });
});

describe('computeBalance — split expenses', () => {
  it('produces a debt from non-payer to payer', () => {
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: false }),
      ],
    });
    expect(result.settlements).toEqual([
      { fromUserId: 'u2', toUserId: 'u1', amount: 50 },
    ]);
    // u1 gets their own 50 share, u2 gets 50.
    expect(result.byMember).toEqual([
      { userId: 'u1', total: 50 },
      { userId: 'u2', total: 50 },
    ]);
  });

  it('nets pairwise debts so only the difference remains', () => {
    const result = computeBalance({
      expenses: [
        // u1 paid 100, u2 owes 60.
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100, isSplit: true }),
        // u2 paid 50, u1 owes 30.
        expense({ id: 'e2', userId: 'u2', amount: 50, convertedAmount: 50, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 40, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 60, isPayer: false }),
        split({ id: 's3', expenseId: 'e2', userId: 'u2', amount: 20, isPayer: true }),
        split({ id: 's4', expenseId: 'e2', userId: 'u1', amount: 30, isPayer: false }),
      ],
    });
    // Net: u2 owes u1 60-30 = 30.
    expect(result.settlements).toEqual([
      { fromUserId: 'u2', toUserId: 'u1', amount: 30 },
    ]);
  });

  it('drops residuals under 1 cent after netting', () => {
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100, isSplit: true }),
        expense({ id: 'e2', userId: 'u2', amount: 100, convertedAmount: 100, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: false }),
        split({ id: 's3', expenseId: 'e2', userId: 'u2', amount: 50, isPayer: true }),
        split({ id: 's4', expenseId: 'e2', userId: 'u1', amount: 50, isPayer: false }),
      ],
    });
    expect(result.settlements).toEqual([]);
  });

  it('ignores deleted split rows', () => {
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: false, deletedAt: '2026-05-10' }),
      ],
    });
    // u2's split is deleted — they no longer participate.
    expect(result.settlements).toEqual([]);
    expect(result.byMember).toEqual([{ userId: 'u1', total: 50 }]);
  });
});
