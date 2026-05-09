// Web build of the expenses query module. Reads/writes go directly to
// Supabase Postgres — no SQLite cache, no sync queue. Photo upload on web
// is wired in Phase 4; for Phase 2 the photos[] field on createExpense is
// silently dropped so a web user can still create non-photo expenses while
// the photoService.web.ts is missing.

import { supabase } from '@/services/supabase';
import type {
  CreateExpenseInput,
  Expense,
  ExpensePhoto,
  ExpenseWithPhotos,
  PaymentMethod,
  UpdateExpenseInput,
} from '@/types/expense';

import type { ExpenseQueries } from './contract';

export type { CreateExpenseInput, UpdateExpenseInput };

interface RemoteExpenseRow {
  id: string;
  trip_id: string;
  user_id: string;
  amount: number | string;
  currency: string;
  converted_amount: number | string;
  exchange_rate: number | string;
  category_id: string;
  note: string | null;
  payment_method: string | null;
  latitude: number | null;
  longitude: number | null;
  place_name: string | null;
  expense_date: string;
  expense_time: string;
  is_refund: boolean;
  is_excluded_from_daily_metrics: boolean;
  is_private: boolean;
  is_split: boolean;
  spread_start_date: string | null;
  spread_end_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface RemoteExpensePhotoRow {
  id: string;
  expense_id: string;
  storage_path: string;
  local_uri: string | null;
  sort_order: number;
  created_at: string;
}

// decimal(12,2) columns come back as strings from PostgREST when the JS
// representation would lose precision. We coerce to number here — totals
// and converted amounts in this app fit in regular floats.
function asNumber(v: number | string): number {
  return typeof v === 'number' ? v : Number(v);
}

function rowToExpense(row: RemoteExpenseRow): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    amount: asNumber(row.amount),
    currency: row.currency,
    convertedAmount: asNumber(row.converted_amount),
    exchangeRate: asNumber(row.exchange_rate),
    categoryId: row.category_id,
    note: row.note,
    paymentMethod: row.payment_method as PaymentMethod | null,
    latitude: row.latitude,
    longitude: row.longitude,
    placeName: row.place_name,
    expenseDate: row.expense_date,
    expenseTime: row.expense_time,
    isRefund: row.is_refund,
    isExcludedFromDailyMetrics: row.is_excluded_from_daily_metrics,
    isPrivate: row.is_private,
    isSplit: row.is_split,
    spreadStartDate: row.spread_start_date,
    spreadEndDate: row.spread_end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function rowToPhoto(row: RemoteExpensePhotoRow): ExpensePhoto {
  return {
    id: row.id,
    expenseId: row.expense_id,
    storagePath: row.storage_path,
    localUri: row.local_uri,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function listExpensesForTrip(tripId: string): Promise<ExpenseWithPhotos[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .order('expense_time', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RemoteExpenseRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: photoData, error: photoError } = await supabase
    .from('expense_photos')
    .select('*')
    .in('expense_id', ids)
    .order('sort_order', { ascending: true });
  if (photoError) throw photoError;
  const photoRows = (photoData ?? []) as RemoteExpensePhotoRow[];

  const byExpenseId = new Map<string, ExpensePhoto[]>();
  for (const p of photoRows) {
    const list = byExpenseId.get(p.expense_id) ?? [];
    list.push(rowToPhoto(p));
    byExpenseId.set(p.expense_id, list);
  }
  return rows.map((row) => ({
    ...rowToExpense(row),
    photos: byExpenseId.get(row.id) ?? [],
  }));
}

export async function getExpense(id: string): Promise<ExpenseWithPhotos | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const expense = rowToExpense(data as RemoteExpenseRow);
  const { data: photoData, error: photoError } = await supabase
    .from('expense_photos')
    .select('*')
    .eq('expense_id', id)
    .order('sort_order', { ascending: true });
  if (photoError) throw photoError;
  const photos = ((photoData ?? []) as RemoteExpensePhotoRow[]).map(rowToPhoto);
  return { ...expense, photos };
}

export async function createExpense(input: CreateExpenseInput): Promise<ExpenseWithPhotos> {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      trip_id: input.tripId,
      user_id: input.userId,
      amount: input.amount,
      currency: input.currency,
      converted_amount: input.convertedAmount,
      exchange_rate: input.exchangeRate,
      category_id: input.categoryId,
      note: input.note,
      payment_method: input.paymentMethod,
      latitude: input.latitude,
      longitude: input.longitude,
      place_name: input.placeName,
      expense_date: input.expenseDate,
      expense_time: input.expenseTime,
      is_refund: input.isRefund,
      is_excluded_from_daily_metrics: input.isExcludedFromDailyMetrics,
      is_private: input.isPrivate,
      is_split: input.isSplit ?? false,
      spread_start_date: input.spreadStartDate,
      spread_end_date: input.spreadEndDate,
    })
    .select('*')
    .single();
  if (error) throw error;
  const expense = rowToExpense(data as RemoteExpenseRow);
  // Photo upload is not wired up on web until Phase 4 of the rollout. Drop
  // any photos[] payload silently for now so the rest of the create flow is
  // usable — the user gets a photoless expense rather than an error.
  if (input.photos && input.photos.length > 0) {
    console.warn('createExpense.web: photos[] dropped; web photo upload lands in Phase 4');
  }
  return { ...expense, photos: [] };
}

export async function updateExpense(input: UpdateExpenseInput): Promise<Expense> {
  const patch: Record<string, unknown> = {};
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.convertedAmount !== undefined) patch.converted_amount = input.convertedAmount;
  if (input.exchangeRate !== undefined) patch.exchange_rate = input.exchangeRate;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.note !== undefined) patch.note = input.note;
  if (input.paymentMethod !== undefined) patch.payment_method = input.paymentMethod;
  if (input.latitude !== undefined) patch.latitude = input.latitude;
  if (input.longitude !== undefined) patch.longitude = input.longitude;
  if (input.placeName !== undefined) patch.place_name = input.placeName;
  if (input.expenseDate !== undefined) patch.expense_date = input.expenseDate;
  if (input.expenseTime !== undefined) patch.expense_time = input.expenseTime;
  if (input.isRefund !== undefined) patch.is_refund = input.isRefund;
  if (input.isExcludedFromDailyMetrics !== undefined) {
    patch.is_excluded_from_daily_metrics = input.isExcludedFromDailyMetrics;
  }
  if (input.isPrivate !== undefined) patch.is_private = input.isPrivate;
  if (input.isSplit !== undefined) patch.is_split = input.isSplit;
  if (input.spreadStartDate !== undefined) patch.spread_start_date = input.spreadStartDate;
  if (input.spreadEndDate !== undefined) patch.spread_end_date = input.spreadEndDate;

  const { data, error } = await supabase
    .from('expenses')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToExpense(data as RemoteExpenseRow);
}

export async function softDeleteExpense(id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw error;
  // Hard-delete photo rows server-side. The native variant also clears local
  // files; on web there are no local files to clean up.
  const { error: photoError } = await supabase
    .from('expense_photos')
    .delete()
    .eq('expense_id', id);
  if (photoError) throw photoError;
}

const _check: ExpenseQueries = {
  listExpensesForTrip,
  getExpense,
  createExpense,
  updateExpense,
  softDeleteExpense,
};
void _check;
