import { Share } from 'react-native';

import type { Expense } from '@/types/expense';
import { formatAmount } from '@/utils/currency';

interface ShareExpenseInput {
  expense: Expense;
  categoryName?: string | null;
  categoryEmoji?: string | null;
  homeCurrency: string;
}

// Builds a friendly one-liner for the system share sheet. Includes both the
// original and converted amount so the recipient gets the same info we show
// in-app.
export function formatExpenseForShare({
  expense,
  categoryName,
  categoryEmoji,
  homeCurrency,
}: ShareExpenseInput): string {
  const lines: string[] = [];
  const header = [categoryEmoji, categoryName].filter(Boolean).join(' ');
  if (header) lines.push(header);

  const primary = formatAmount(expense.amount, expense.currency);
  const prefix = expense.isRefund ? '+' : '';
  let amountLine = `${prefix}${primary}`;
  if (expense.currency !== homeCurrency) {
    amountLine += ` (≈ ${formatAmount(expense.convertedAmount, homeCurrency)})`;
  }
  lines.push(amountLine);

  if (expense.note?.trim()) lines.push(expense.note.trim());
  if (expense.placeName) lines.push(`📍 ${expense.placeName}`);
  lines.push(`🗓 ${expense.expenseDate} ${expense.expenseTime.slice(0, 5)}`);
  return lines.join('\n');
}

export async function shareExpense(input: ShareExpenseInput): Promise<void> {
  const message = formatExpenseForShare(input);
  try {
    await Share.share({ message });
  } catch (error) {
    console.warn('Share failed:', error);
  }
}
