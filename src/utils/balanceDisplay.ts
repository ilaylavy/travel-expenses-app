import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import type { PairwiseSettlement } from '@/utils/balance';
import { roundAmount } from '@/utils/currency';

export interface OutstandingSummary {
  // Debts where the current user is the debtor (fromUserId === currentUserId).
  youOwe: PairwiseSettlement[];
  // Debts where the current user is the creditor (toUserId === currentUserId).
  owesYou: PairwiseSettlement[];
}

// Filters pairwise debts (typically the netted `settlements` from
// computeBalance) to just those involving the current user, split by
// direction. Cross-pair debts between two other members are excluded — they
// don't affect what the current user can act on.
export function selectOutstandingForUser(
  debts: PairwiseSettlement[],
  currentUserId: string,
): OutstandingSummary {
  return {
    youOwe: debts.filter((d) => d.fromUserId === currentUserId),
    owesYou: debts.filter((d) => d.toUserId === currentUserId),
  };
}

// One row in the read-only SHARED EXPENSES section.
export interface SharedExpenseRow {
  expense: ExpenseWithPhotos;
  payerUserId: string;
  // True when the current user is the payer (creditor on this expense).
  userIsPayer: boolean;
  // Current user's own share in home currency. When userIsPayer=false this
  // is what they owe the payer; when userIsPayer=true it's their own portion
  // of the bill (not a debt).
  userShareConverted: number;
  // Other non-payers' shares in home currency. Populated only when
  // userIsPayer=true (so the UI can list "Noa owes you X · Bob owes you Y").
  // Empty when userIsPayer=false. Sorted by descending share amount, then
  // by userId as a tiebreaker for stable output.
  otherNonPayers: { userId: string; shareConverted: number }[];
}

function shareInHome(
  expenseAmount: number,
  expenseConverted: number,
  splitAmount: number,
): number {
  if (expenseAmount === 0) return 0;
  return roundAmount(expenseConverted * (splitAmount / expenseAmount));
}

// Returns one row per split expense the current user participates in,
// sorted newest first by expense date/time/created_at. Filters out:
//   - non-split, deleted, or private expenses (mirrors computeBalance)
//   - expenses where the current user has no active (non-deleted) split
export function selectMySharedExpenses(
  expenses: ExpenseWithPhotos[],
  splits: ExpenseSplit[],
  currentUserId: string,
): SharedExpenseRow[] {
  // Index splits by expense id, dropping soft-deleted rows up front.
  const splitsByExpense = new Map<string, ExpenseSplit[]>();
  for (const s of splits) {
    if (s.deletedAt !== null) continue;
    const list = splitsByExpense.get(s.expenseId) ?? [];
    list.push(s);
    splitsByExpense.set(s.expenseId, list);
  }

  const rows: SharedExpenseRow[] = [];
  for (const e of expenses) {
    if (e.deletedAt !== null) continue;
    if (e.isPrivate) continue;
    if (!e.isSplit) continue;
    const expenseSplits = splitsByExpense.get(e.id) ?? [];
    if (expenseSplits.length === 0) continue;

    // Find the current user's split. If absent, they don't participate.
    const mySplit = expenseSplits.find((s) => s.userId === currentUserId);
    if (!mySplit) continue;

    // Resolve the payer: prefer the is_payer split (server-side truth);
    // fall back to expense.userId if no is_payer flag is set anywhere.
    const payerSplit = expenseSplits.find((s) => s.isPayer);
    const payerUserId = payerSplit?.userId ?? e.userId;
    const userIsPayer = payerUserId === currentUserId;

    const userShareConverted = shareInHome(e.amount, e.convertedAmount, mySplit.amount);

    let otherNonPayers: { userId: string; shareConverted: number }[] = [];
    if (userIsPayer) {
      otherNonPayers = expenseSplits
        .filter((s) => !s.isPayer && s.userId !== currentUserId)
        .map((s) => ({
          userId: s.userId,
          shareConverted: shareInHome(e.amount, e.convertedAmount, s.amount),
        }))
        .sort((a, b) => {
          if (b.shareConverted !== a.shareConverted) {
            return b.shareConverted - a.shareConverted;
          }
          return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
        });
    }

    rows.push({
      expense: e,
      payerUserId,
      userIsPayer,
      userShareConverted,
      otherNonPayers,
    });
  }

  // Newest first — same ordering used in the expenses list elsewhere.
  rows.sort((a, b) => {
    const ad = a.expense.expenseDate;
    const bd = b.expense.expenseDate;
    if (ad !== bd) return ad < bd ? 1 : -1;
    const at = a.expense.expenseTime;
    const bt = b.expense.expenseTime;
    if (at !== bt) return at < bt ? 1 : -1;
    const ac = a.expense.createdAt;
    const bc = b.expense.createdAt;
    return ac < bc ? 1 : ac > bc ? -1 : 0;
  });

  return rows;
}
