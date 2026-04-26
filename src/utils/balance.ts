import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import { roundAmount } from '@/utils/currency';

export interface MemberShareTotal {
  userId: string;
  total: number;
}

export interface PairwiseSettlement {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface BalanceSummary {
  byMember: MemberShareTotal[];
  settlements: PairwiseSettlement[];
}

export interface ComputeBalanceInput {
  expenses: ExpenseWithPhotos[];
  splits: ExpenseSplit[];
}

// Compute each member's share of trip cost and the netted pairwise settlements
// produced by per-expense splitting.
//
//   - Non-split expenses: the payer (expense.user_id) absorbs the full
//     converted amount as their share. They generate no debt.
//   - Split expenses: each split row contributes that user's share, with the
//     home-currency value derived from the trip-currency ratio against the
//     parent expense.
//   - Private expenses are skipped (RLS already filters them server-side, but
//     we defend in client code too).
//   - Refunds: the negative converted amount flows through naturally (each
//     member's share goes down) and split refunds simply produce a negative
//     debt.
export function computeBalance({ expenses, splits }: ComputeBalanceInput): BalanceSummary {
  const active = expenses.filter((e) => e.deletedAt === null && !e.isPrivate);

  // Index splits by expense id for O(1) lookup.
  const splitsByExpense = new Map<string, ExpenseSplit[]>();
  for (const s of splits) {
    if (s.deletedAt !== null) continue;
    const list = splitsByExpense.get(s.expenseId) ?? [];
    list.push(s);
    splitsByExpense.set(s.expenseId, list);
  }

  // Per-member share total (in home currency).
  const memberShares = new Map<string, number>();
  // Directional debt accumulator: debts[debtor][creditor] = amount.
  const debts = new Map<string, Map<string, number>>();

  const addDebt = (from: string, to: string, amount: number) => {
    if (from === to) return;
    if (amount === 0) return;
    let inner = debts.get(from);
    if (!inner) {
      inner = new Map();
      debts.set(from, inner);
    }
    inner.set(to, (inner.get(to) ?? 0) + amount);
  };

  const addShare = (userId: string, amount: number) => {
    memberShares.set(userId, (memberShares.get(userId) ?? 0) + amount);
  };

  for (const e of active) {
    const expenseSplits = e.isSplit ? splitsByExpense.get(e.id) ?? [] : [];

    if (!e.isSplit || expenseSplits.length === 0) {
      // Non-split expense — payer absorbs the whole share.
      addShare(e.userId, e.convertedAmount);
      continue;
    }

    // Split expense — find the payer and divide the converted amount by ratio.
    const payerSplit = expenseSplits.find((s) => s.isPayer);
    const payerId = payerSplit?.userId ?? e.userId;
    const totalAmount = e.amount;
    const totalConverted = e.convertedAmount;

    for (const s of expenseSplits) {
      const ratio = totalAmount === 0 ? 0 : s.amount / totalAmount;
      const sharedConverted = roundAmount(totalConverted * ratio);
      addShare(s.userId, sharedConverted);
      if (!s.isPayer) {
        addDebt(s.userId, payerId, sharedConverted);
      }
    }
  }

  // Net each pair: if A owes B 10 and B owes A 6, the net is A owes B 4.
  const settled = new Set<string>();
  const settlements: PairwiseSettlement[] = [];
  const allUsers = Array.from(debts.keys());
  for (const a of allUsers) {
    const inner = debts.get(a);
    if (!inner) continue;
    for (const b of inner.keys()) {
      const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (settled.has(pairKey)) continue;
      settled.add(pairKey);

      const aOwesB = inner.get(b) ?? 0;
      const bOwesA = debts.get(b)?.get(a) ?? 0;
      const net = roundAmount(aOwesB - bOwesA);
      if (Math.abs(net) < 0.01) continue;
      if (net > 0) {
        settlements.push({ fromUserId: a, toUserId: b, amount: net });
      } else {
        settlements.push({ fromUserId: b, toUserId: a, amount: -net });
      }
    }
  }

  const byMember: MemberShareTotal[] = Array.from(memberShares.entries())
    .map(([userId, total]) => ({ userId, total: roundAmount(total) }))
    .sort((a, b) => b.total - a.total);

  settlements.sort((a, b) => b.amount - a.amount);

  return { byMember, settlements };
}
