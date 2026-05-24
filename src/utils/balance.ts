import type { ExpenseSplit, ExpenseWithPhotos } from '@/types/expense';
import type { SettlementPayment } from '@/types/settlement';
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
  // Pairwise NETTED settlements. One entry per non-zero pair, after summing
  // both directions and any unattributed settlement payments. Use this for
  // single-line summaries (e.g. the stats SplitBalanceCard).
  settlements: PairwiseSettlement[];
  // Gross directional debts. One entry per non-zero (from→to) direction.
  // Unlike `settlements`, both directions can appear for the same pair: if
  // Alice paid for $100 of Bob's stuff and Bob paid for $30 of Alice's, this
  // contains BOTH { Bob→Alice: 100 } and { Alice→Bob: 30 } so the UI can
  // surface each expense's contribution without losing offsets to netting.
  // Attributed AND unattributed settlement_payments are applied directly to
  // the matching direction (overpayment flips the excess to the opposite).
  grossDebts: PairwiseSettlement[];
}

export interface ComputeBalanceInput {
  expenses: ExpenseWithPhotos[];
  splits: ExpenseSplit[];
  // Optional. Recorded debt-settlement events that reduce pairwise debts.
  // Each payment cancels (or flips, if it exceeds the existing debt) the
  // amount one member owes another. byMember is unaffected — settlements
  // don't change anyone's share of trip cost.
  settlementPayments?: SettlementPayment[];
}

// Compute each member's share of trip cost and the netted pairwise settlements
// produced by per-expense splitting (and reduced by any recorded payments).
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
//   - Settlement payments come in two flavors:
//       * Attributed (expenseSplitId != null): the matching split is removed
//         from gross-debt accumulation. byMember is unaffected — the user
//         still bears the trip-cost share, they've just paid it.
//       * Unattributed (expenseSplitId == null): the legacy pair-level flow.
//         Recorded as an inverse debt (to owes from); the pairwise netter
//         cancels it against any real debt. Over-settling flips direction.
export function computeBalance({
  expenses,
  splits,
  settlementPayments,
}: ComputeBalanceInput): BalanceSummary {
  const active = expenses.filter((e) => e.deletedAt === null && !e.isPrivate);

  // Index splits by expense id for O(1) lookup.
  const splitsByExpense = new Map<string, ExpenseSplit[]>();
  for (const s of splits) {
    if (s.deletedAt !== null) continue;
    const list = splitsByExpense.get(s.expenseId) ?? [];
    list.push(s);
    splitsByExpense.set(s.expenseId, list);
  }

  // Build set of split IDs that have an active attributed settlement. These
  // splits contribute to byMember (the user still bears the cost share) but
  // not to gross debt (already paid).
  const attributedSettledSplits = new Set<string>();
  if (settlementPayments) {
    for (const p of settlementPayments) {
      if (p.deletedAt !== null) continue;
      if (p.expenseSplitId !== null) attributedSettledSplits.add(p.expenseSplitId);
    }
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
      if (!s.isPayer && !attributedSettledSplits.has(s.id)) {
        addDebt(s.userId, payerId, sharedConverted);
      }
    }
  }

  // Apply UNATTRIBUTED settlement payments directly to the matching direction.
  // Attributed ones were already handled above by skipping the matching
  // split's debt contribution. A from→to payment reduces `from`'s debt to
  // `to`; any excess flips to the opposite direction (receiver now owes
  // payer). Applying directly (rather than the old reverse-debt trick) makes
  // grossDebts below reflect what each side actually still owes — otherwise a
  // partial payment would still appear under its original full amount.
  if (settlementPayments) {
    for (const p of settlementPayments) {
      if (p.deletedAt !== null) continue;
      if (p.expenseSplitId !== null) continue;
      const fromInner = debts.get(p.fromUserId);
      const fromOwes = fromInner?.get(p.toUserId) ?? 0;
      const remaining = fromOwes - p.convertedAmount;
      if (remaining >= 0) {
        if (fromInner) fromInner.set(p.toUserId, remaining);
        // If there was no existing fromInner, fromOwes was 0 → remaining is
        // negative → goes to the else branch; we never reach this no-op path.
      } else {
        // Overpayment: clear this direction, add the excess to the opposite.
        if (fromInner) fromInner.set(p.toUserId, 0);
        addDebt(p.toUserId, p.fromUserId, -remaining);
      }
    }
  }

  // Gross directional debts: every (from, to) entry that still has a positive
  // balance after settlements. Both directions of the same pair can appear.
  const grossDebts: PairwiseSettlement[] = [];
  for (const [from, inner] of debts) {
    for (const [to, amount] of inner) {
      const rounded = roundAmount(amount);
      if (rounded < 0.01) continue;
      grossDebts.push({ fromUserId: from, toUserId: to, amount: rounded });
    }
  }
  grossDebts.sort((a, b) => b.amount - a.amount);

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

  return { byMember, settlements, grossDebts };
}
