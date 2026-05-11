// Settlement payment — a recorded debt-settlement event between two trip
// members. Pair-level (not attributed to a specific expense). Reduces the
// pairwise debt netted by balance.ts.
//
// Amount is in `currency`, which is either the trip currency or the trip's
// home currency (user picks at creation time). exchangeRate locks the rate
// at creation time; convertedAmount is the home-currency value used by the
// balance calculation. Mirrors the rate-lock pattern from expenses.

export interface SettlementPayment {
  id: string;
  tripId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  convertedAmount: number;
  settledDate: string;
  note: string | null;
  // When non-null, this settlement is attributed to a specific expense_splits
  // row. balance.ts removes that split's debt from the gross rather than
  // doing inverse-debt netting. Null = legacy pair-level (amount-based) flow.
  expenseSplitId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Raw row shape as returned by SQLite / pulled from Postgres before mapping.
export interface SettlementPaymentRow {
  id: string;
  trip_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  converted_amount: number;
  settled_date: string;
  note: string | null;
  expense_split_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateSettlementInput {
  tripId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  convertedAmount: number;
  settledDate: string;
  note?: string | null;
  // Optional. When set, the settlement is attributed to a specific
  // expense_splits row. Used by the per-expense Settle flow on the Balances
  // pair card.
  expenseSplitId?: string | null;
}

export interface UpdateSettlementInput {
  id: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  convertedAmount: number;
  settledDate: string;
  note: string | null;
}
