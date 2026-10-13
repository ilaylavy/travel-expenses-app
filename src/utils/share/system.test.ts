import { Share } from 'react-native';

import { formatExpenseForShare, shareExpense } from './system';
import type { Expense } from '@/types/expense';
import { formatAmount } from '@/utils/currency';

jest.mock('react-native', () => ({
  Share: {
    share: jest.fn(),
  },
}));

jest.mock('@/utils/currency', () => ({
  formatAmount: jest.fn((amount, currency) => `${amount} ${currency}`),
}));

describe('system share utilities', () => {
  const mockExpense = {
    amount: 100,
    currency: 'USD',
    convertedAmount: 85,
    isRefund: false,
    note: 'Dinner',
    placeName: 'Pizza Place',
    expenseDate: '2023-10-15',
    expenseTime: '19:30:00',
  } as unknown as Expense;

  describe('formatExpenseForShare', () => {
    it('formats a basic expense', () => {
      const result = formatExpenseForShare({
        expense: mockExpense,
        homeCurrency: 'USD',
      });
      expect(result).toBe('100 USD\nDinner\n📍 Pizza Place\n🗓 2023-10-15 19:30');
    });

    it('includes category emoji and name if provided', () => {
      const result = formatExpenseForShare({
        expense: mockExpense,
        categoryName: 'Food',
        categoryEmoji: '🍔',
        homeCurrency: 'USD',
      });
      expect(result).toBe('🍔 Food\n100 USD\nDinner\n📍 Pizza Place\n🗓 2023-10-15 19:30');
    });

    it('formats a refund correctly', () => {
      const refundExpense = { ...mockExpense, isRefund: true } as unknown as Expense;
      const result = formatExpenseForShare({
        expense: refundExpense,
        homeCurrency: 'USD',
      });
      expect(result).toBe('+100 USD\nDinner\n📍 Pizza Place\n🗓 2023-10-15 19:30');
    });

    it('includes converted amount if currency differs from homeCurrency', () => {
      const result = formatExpenseForShare({
        expense: mockExpense,
        homeCurrency: 'EUR',
      });
      expect(result).toBe('100 USD (≈ 85 EUR)\nDinner\n📍 Pizza Place\n🗓 2023-10-15 19:30');
    });
  });

  describe('shareExpense', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('calls Share.share with formatted message', async () => {
      (Share.share as jest.Mock).mockResolvedValueOnce({ action: 'sharedAction' });

      await shareExpense({
        expense: mockExpense,
        homeCurrency: 'USD',
      });

      expect(Share.share).toHaveBeenCalledWith({
        message: '100 USD\nDinner\n📍 Pizza Place\n🗓 2023-10-15 19:30',
      });
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('handles and logs error if Share.share fails', async () => {
      const error = new Error('Network error');
      (Share.share as jest.Mock).mockRejectedValueOnce(error);

      await shareExpense({
        expense: mockExpense,
        homeCurrency: 'USD',
      });

      expect(Share.share).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('Share failed:', error);
    });
  });
});
