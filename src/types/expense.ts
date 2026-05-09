export type PaymentMethod = 'cash' | 'credit' | 'debit' | string;

export interface Expense {
  id: string;
  tripId: string;
  userId: string;
  amount: number;
  currency: string;
  convertedAmount: number;
  exchangeRate: number;
  categoryId: string;
  note: string | null;
  paymentMethod: PaymentMethod | null;
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  expenseDate: string;
  expenseTime: string;
  isRefund: boolean;
  isExcludedFromDailyMetrics: boolean;
  isPrivate: boolean;
  isSplit: boolean;
  spreadStartDate: string | null;
  spreadEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  userId: string;
  amount: number;
  isPayer: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpensePhoto {
  id: string;
  expenseId: string;
  storagePath: string;
  localUri: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ExpenseWithPhotos extends Expense {
  photos: ExpensePhoto[];
}

// Raw SQLite row shapes for the expenses domain. Kept here so query files share
// one declaration each (no drift) and the rowToX mappers can be implemented
// next to the SQL that produces them.

export interface ExpenseRow {
  id: string;
  trip_id: string;
  user_id: string;
  amount: number;
  currency: string;
  converted_amount: number;
  exchange_rate: number;
  category_id: string;
  note: string | null;
  payment_method: string | null;
  latitude: number | null;
  longitude: number | null;
  place_name: string | null;
  expense_date: string;
  expense_time: string;
  is_refund: number;
  is_excluded_from_daily_metrics: number;
  is_private: number;
  is_split: number;
  spread_start_date: string | null;
  spread_end_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ExpensePhotoRow {
  id: string;
  expense_id: string;
  storage_path: string;
  local_uri: string | null;
  sort_order: number;
  created_at: string;
}

export interface ExpenseSplitRow {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  is_payer: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// =========================================================
// Query inputs/outputs — shared between native and web variants of the
// query layer. The implementations live in src/db/queries/*.{native,web}.ts;
// the types live here so both sides import from a single source of truth.
// =========================================================

export interface CreateExpenseInput {
  tripId: string;
  userId: string;
  amount: number;
  currency: string;
  convertedAmount: number;
  exchangeRate: number;
  categoryId: string;
  note: string | null;
  paymentMethod: PaymentMethod | null;
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  expenseDate: string;
  expenseTime: string;
  isRefund: boolean;
  isExcludedFromDailyMetrics: boolean;
  isPrivate: boolean;
  isSplit?: boolean;
  spreadStartDate: string | null;
  spreadEndDate: string | null;
  // id is optional; callers that persist files to disk before insertion
  // pre-generate it so the file path can embed it.
  photos?: { id?: string; localUri: string }[];
}

export interface UpdateExpenseInput {
  id: string;
  amount?: number;
  currency?: string;
  convertedAmount?: number;
  exchangeRate?: number;
  categoryId?: string;
  note?: string | null;
  paymentMethod?: PaymentMethod | null;
  latitude?: number | null;
  longitude?: number | null;
  placeName?: string | null;
  expenseDate?: string;
  expenseTime?: string;
  isRefund?: boolean;
  isExcludedFromDailyMetrics?: boolean;
  isPrivate?: boolean;
  isSplit?: boolean;
  spreadStartDate?: string | null;
  spreadEndDate?: string | null;
}

export interface CreateSplitInput {
  userId: string;
  amount: number;
  isPayer: boolean;
}

export interface RecentNoteSuggestion {
  note: string;
  categoryId: string;
  categoryEmoji: string;
}
