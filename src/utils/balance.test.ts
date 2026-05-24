import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import type { SettlementPayment } from '@/types/settlement';

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
    momentId: null,
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

function settlement(overrides: Partial<SettlementPayment>): SettlementPayment {
  return {
    id: 'p1',
    tripId: 't1',
    fromUserId: 'u1',
    toUserId: 'u2',
    amount: 50,
    currency: 'USD',
    exchangeRate: 1,
    convertedAmount: 50,
    settledDate: '2026-05-10',
    note: null,
    expenseSplitId: null,
    createdAt: '2026-05-10T09:00:00Z',
    updatedAt: '2026-05-10T09:00:00Z',
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

describe('computeBalance — settlement payments', () => {
  // u1 paid 100, split 50/50 → u2 owes u1 50.
  function debtFixture() {
    return {
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: false }),
      ],
    };
  }

  it('zeroes a pair when settlement exactly covers the debt', () => {
    const result = computeBalance({
      ...debtFixture(),
      settlementPayments: [
        // u2 pays u1 back the full 50.
        settlement({ fromUserId: 'u2', toUserId: 'u1', amount: 50, convertedAmount: 50 }),
      ],
    });
    expect(result.settlements).toEqual([]);
    // byMember is unchanged — settlements don't change trip-cost share.
    expect(result.byMember).toEqual([
      { userId: 'u1', total: 50 },
      { userId: 'u2', total: 50 },
    ]);
  });

  it('reduces an outstanding debt by the settled amount', () => {
    const result = computeBalance({
      ...debtFixture(),
      settlementPayments: [
        // u2 pays u1 back 30 of the 50.
        settlement({ fromUserId: 'u2', toUserId: 'u1', amount: 30, convertedAmount: 30 }),
      ],
    });
    expect(result.settlements).toEqual([
      { fromUserId: 'u2', toUserId: 'u1', amount: 20 },
    ]);
  });

  it('flips direction when the settlement exceeds the debt', () => {
    const result = computeBalance({
      ...debtFixture(),
      settlementPayments: [
        // u2 hands u1 70 against a 50 debt — u1 now owes u2 20.
        settlement({ fromUserId: 'u2', toUserId: 'u1', amount: 70, convertedAmount: 70 }),
      ],
    });
    expect(result.settlements).toEqual([
      { fromUserId: 'u1', toUserId: 'u2', amount: 20 },
    ]);
  });

  it('stacks multiple settlements between the same pair', () => {
    const result = computeBalance({
      ...debtFixture(),
      settlementPayments: [
        settlement({ id: 'p1', fromUserId: 'u2', toUserId: 'u1', amount: 20, convertedAmount: 20 }),
        settlement({ id: 'p2', fromUserId: 'u2', toUserId: 'u1', amount: 30, convertedAmount: 30 }),
      ],
    });
    // Total settled = 50 = full debt.
    expect(result.settlements).toEqual([]);
  });

  it('ignores deleted settlements', () => {
    const result = computeBalance({
      ...debtFixture(),
      settlementPayments: [
        settlement({
          fromUserId: 'u2',
          toUserId: 'u1',
          amount: 50,
          convertedAmount: 50,
          deletedAt: '2026-05-11T10:00:00Z',
        }),
      ],
    });
    // Reversed settlement → original debt re-appears in full.
    expect(result.settlements).toEqual([
      { fromUserId: 'u2', toUserId: 'u1', amount: 50 },
    ]);
  });

  it('creates a reverse debt when a settlement is recorded without prior debt', () => {
    const result = computeBalance({
      expenses: [],
      splits: [],
      settlementPayments: [
        // u1 hands u2 40 with no underlying expense debt — u2 now owes u1 40.
        settlement({ fromUserId: 'u1', toUserId: 'u2', amount: 40, convertedAmount: 40 }),
      ],
    });
    expect(result.settlements).toEqual([
      { fromUserId: 'u2', toUserId: 'u1', amount: 40 },
    ]);
  });

  it('isolates settlements to their pair in a 3-person trip', () => {
    const result = computeBalance({
      expenses: [
        // u1 paid 90, split three ways → u2 and u3 each owe u1 30.
        expense({ id: 'e1', userId: 'u1', amount: 90, convertedAmount: 90, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 30, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 30 }),
        split({ id: 's3', expenseId: 'e1', userId: 'u3', amount: 30 }),
      ],
      settlementPayments: [
        // u2 pays u1 back. u3 still owes.
        settlement({ fromUserId: 'u2', toUserId: 'u1', amount: 30, convertedAmount: 30 }),
      ],
    });
    expect(result.settlements).toEqual([
      { fromUserId: 'u3', toUserId: 'u1', amount: 30 },
    ]);
  });

  it('nets a 4-person trip with mixed split debts and partial settlements', () => {
    // u1 paid 200, split four ways → u2/u3/u4 each owe u1 50.
    // u2 paid 80, split between u1 and u2 (40 each) → u1 owes u2 40.
    // Settlements: u3 paid u1 30; u4 paid u1 50 (full settlement).
    // Expected outstanding pairs after netting:
    //   u2 → u1: u2 owes 50, u1 owes 40 → u2 owes u1 10
    //   u3 → u1: 50 - 30 = u3 owes u1 20
    //   u4 → u1: 50 - 50 = settled (no row)
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 200, convertedAmount: 200, isSplit: true }),
        expense({ id: 'e2', userId: 'u2', amount: 80, convertedAmount: 80, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 50 }),
        split({ id: 's3', expenseId: 'e1', userId: 'u3', amount: 50 }),
        split({ id: 's4', expenseId: 'e1', userId: 'u4', amount: 50 }),
        split({ id: 's5', expenseId: 'e2', userId: 'u2', amount: 40, isPayer: true }),
        split({ id: 's6', expenseId: 'e2', userId: 'u1', amount: 40 }),
      ],
      settlementPayments: [
        settlement({ id: 'p1', fromUserId: 'u3', toUserId: 'u1', amount: 30, convertedAmount: 30 }),
        settlement({ id: 'p2', fromUserId: 'u4', toUserId: 'u1', amount: 50, convertedAmount: 50 }),
      ],
    });
    // settlements list is sorted by amount desc.
    expect(result.settlements).toEqual([
      { fromUserId: 'u3', toUserId: 'u1', amount: 20 },
      { fromUserId: 'u2', toUserId: 'u1', amount: 10 },
    ]);
  });

  it('attributed settlement removes the matching split from gross debt', () => {
    // u2 owes u1 50 for expense e1. An attributed settle on u2's split row
    // wipes that debt without flipping anything.
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: false }),
      ],
      settlementPayments: [
        settlement({ fromUserId: 'u2', toUserId: 'u1', convertedAmount: 50, expenseSplitId: 's2' }),
      ],
    });
    expect(result.settlements).toEqual([]);
    // byMember unchanged: each member still bears their share of trip cost.
    expect(result.byMember).toEqual([
      { userId: 'u1', total: 50 },
      { userId: 'u2', total: 50 },
    ]);
  });

  it('reversing an attributed settlement re-opens the original debt', () => {
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: false }),
      ],
      settlementPayments: [
        settlement({
          fromUserId: 'u2',
          toUserId: 'u1',
          convertedAmount: 50,
          expenseSplitId: 's2',
          deletedAt: '2026-05-11T10:00:00Z',
        }),
      ],
    });
    expect(result.settlements).toEqual([
      { fromUserId: 'u2', toUserId: 'u1', amount: 50 },
    ]);
  });

  it('attributed and unattributed settlements compose without double-counting', () => {
    // u1 paid two split expenses, u2 owes 50 + 30 = 80 in total.
    // Attributed settle covers e1's 50; unattributed pair-level settle adds 30.
    // Outstanding should be 0.
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 100, convertedAmount: 100, isSplit: true }),
        expense({ id: 'e2', userId: 'u1', amount: 60, convertedAmount: 60, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 50, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 50, isPayer: false }),
        split({ id: 's3', expenseId: 'e2', userId: 'u1', amount: 30, isPayer: true }),
        split({ id: 's4', expenseId: 'e2', userId: 'u2', amount: 30, isPayer: false }),
      ],
      settlementPayments: [
        settlement({ id: 'p1', fromUserId: 'u2', toUserId: 'u1', convertedAmount: 50, expenseSplitId: 's2' }),
        settlement({ id: 'p2', fromUserId: 'u2', toUserId: 'u1', convertedAmount: 30 }), // unattributed
      ],
    });
    expect(result.settlements).toEqual([]);
  });

  it('attributed settle on one of N splits in a 3-person trip leaves the others outstanding', () => {
    // u1 paid 90, three-way split: u2 and u3 each owe 30.
    // Attributed settle covers u2's split only. u3 still owes.
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 90, convertedAmount: 90, isSplit: true }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 30, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 30 }),
        split({ id: 's3', expenseId: 'e1', userId: 'u3', amount: 30 }),
      ],
      settlementPayments: [
        settlement({ fromUserId: 'u2', toUserId: 'u1', convertedAmount: 30, expenseSplitId: 's2' }),
      ],
    });
    expect(result.settlements).toEqual([
      { fromUserId: 'u3', toUserId: 'u1', amount: 30 },
    ]);
  });

  it('keeps the home-currency value frozen from when the settlement was recorded', () => {
    // u2 owes u1 100 EUR (home currency). u2 paid 80 USD that converted to
    // 100 EUR at the time. exchange_rate fluctuating later doesn't matter —
    // the locked converted_amount is what nets against the debt.
    const result = computeBalance({
      expenses: [
        expense({ id: 'e1', userId: 'u1', amount: 200, convertedAmount: 200, isSplit: true, currency: 'EUR' }),
      ],
      splits: [
        split({ id: 's1', expenseId: 'e1', userId: 'u1', amount: 100, isPayer: true }),
        split({ id: 's2', expenseId: 'e1', userId: 'u2', amount: 100 }),
      ],
      settlementPayments: [
        settlement({
          fromUserId: 'u2',
          toUserId: 'u1',
          amount: 80,
          currency: 'USD',
          exchangeRate: 1.25, // 80 USD * 1.25 = 100 EUR
          convertedAmount: 100,
        }),
      ],
    });
    expect(result.settlements).toEqual([]);
  });
});

