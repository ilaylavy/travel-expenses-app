import type { Expense } from '@/types/expense';

import { formatExpenseForShare } from './system';

jest.mock('react-native', () => ({
  Share: {
    share: jest.fn(),
  },
}));

function createMockExpense(overrides: Partial<Expense>): Expense {
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
    ...overrides,
  };
}

describe('formatExpenseForShare', () => {
  it('formats basic expense without optional fields', () => {
    const expense = createMockExpense({
      amount: 42.5,
      currency: 'USD',
      convertedAmount: 42.5,
      expenseDate: '2023-10-15',
      expenseTime: '14:30:00',
    });

    const result = formatExpenseForShare({
      expense,
      homeCurrency: 'USD',
    });

    expect(result).toBe('$42.50\n🗓 2023-10-15 14:30');
  });

  it('includes category emoji and name', () => {
    const expense = createMockExpense({
      amount: 15,
      currency: 'USD',
      convertedAmount: 15,
      expenseDate: '2023-10-15',
      expenseTime: '09:00:00',
    });

    const result = formatExpenseForShare({
      expense,
      categoryName: 'Food',
      categoryEmoji: '🍔',
      homeCurrency: 'USD',
    });

    expect(result).toBe('🍔 Food\n$15.00\n🗓 2023-10-15 09:00');
  });

  it('prefixes refunds with +', () => {
    const expense = createMockExpense({
      amount: 20,
      currency: 'USD',
      convertedAmount: 20,
      isRefund: true,
      expenseDate: '2023-10-15',
      expenseTime: '10:00:00',
    });

    const result = formatExpenseForShare({
      expense,
      homeCurrency: 'USD',
    });

    expect(result).toBe('+$20.00\n🗓 2023-10-15 10:00');
  });

  it('includes converted amount when currency differs from home currency', () => {
    const expense = createMockExpense({
      amount: 1000,
      currency: 'JPY',
      convertedAmount: 6.75, // Assuming some conversion rate
      expenseDate: '2023-10-15',
      expenseTime: '11:00:00',
    });

    const result = formatExpenseForShare({
      expense,
      homeCurrency: 'USD',
    });

    expect(result).toBe('¥1,000 (≈ $6.75)\n🗓 2023-10-15 11:00');
  });

  it('includes note and placeName', () => {
    const expense = createMockExpense({
      amount: 50,
      currency: 'USD',
      convertedAmount: 50,
      note: 'Dinner with friends',
      placeName: 'Local Restaurant',
      expenseDate: '2023-10-15',
      expenseTime: '19:30:00',
    });

    const result = formatExpenseForShare({
      expense,
      homeCurrency: 'USD',
    });

    expect(result).toBe('$50.00\nDinner with friends\n📍 Local Restaurant\n🗓 2023-10-15 19:30');
  });
});
