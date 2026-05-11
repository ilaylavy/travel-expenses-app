// Web build of the expenses query module. Reads/writes go directly to
// Supabase Postgres — no SQLite cache, no sync queue. Photo upload on web
// is wired in Phase 4; for Phase 2 the photos[] field on createExpense is
// silently dropped so a web user can still create non-photo expenses while
// the photoService.web.ts is missing.

import {
  deleteLocalPhoto,
  uploadPhotoToStorage,
} from '@/services/photoService';
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
import { SettlementAttributedError } from './errors';

export type { CreateExpenseInput, UpdateExpenseInput };

// True when any non-deleted split of this expense has an active attributed
// settlement. Pulls expense_split_id-filtered settlement rows joined to splits
// of this expense; any match blocks the operation.
async function hasActiveAttributedSettlementForExpense(
  expenseId: string,
): Promise<boolean> {
  // Two-step: pull split ids, then check settlements. PostgREST doesn't do
  // arbitrary cross-table joins in a single query, so the round-trip pattern
  // mirrors what other multi-table reads in this file do.
  const { data: splitIds, error: splitErr } = await supabase
    .from('expense_splits')
    .select('id')
    .eq('expense_id', expenseId);
  if (splitErr) throw splitErr;
  const ids = (splitIds ?? []).map((r) => r.id as string);
  if (ids.length === 0) return false;
  const { count, error: settleErr } = await supabase
    .from('settlement_payments')
    .select('id', { count: 'exact', head: true })
    .in('expense_split_id', ids)
    .is('deleted_at', null)
    .not('expense_split_id', 'is', null);
  if (settleErr) throw settleErr;
  return (count ?? 0) > 0;
}

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

  // Photo upload happens inline (no sync queue on web). Each photo: upload
  // bytes to Storage, then insert the expense_photos row pointing at that
  // path. We tolerate per-photo failures — the expense itself is already
  // saved at this point, and a failed photo upload shouldn't roll back the
  // whole expense.
  const photos: ExpensePhoto[] = [];
  if (input.photos && input.photos.length > 0) {
    for (let i = 0; i < input.photos.length; i += 1) {
      const draft = input.photos[i];
      const photoId = draft.id ?? crypto.randomUUID();
      try {
        const storagePath = await uploadPhotoToStorage({
          tripId: input.tripId,
          expenseId: expense.id,
          photoId,
          localUri: draft.localUri,
        });
        const { data: photoRow, error: photoError } = await supabase
          .from('expense_photos')
          .insert({
            id: photoId,
            expense_id: expense.id,
            storage_path: storagePath,
            // local_uri is intentionally null on web rows: the blob URL is
            // browser-tab-scoped and doesn't survive a refresh, let alone
            // sync to other devices.
            local_uri: null,
            sort_order: i,
          })
          .select('*')
          .single();
        if (photoError) throw photoError;
        photos.push({
          id: photoRow.id,
          expenseId: photoRow.expense_id,
          storagePath: photoRow.storage_path,
          localUri: null,
          sortOrder: photoRow.sort_order,
          createdAt: photoRow.created_at,
        });
      } catch (e) {
        console.warn('createExpense.web: photo upload failed', e);
        // Best-effort cleanup of the staged blob URL so we don't leak it.
        await deleteLocalPhoto(draft.localUri);
      }
    }
  }
  return { ...expense, photos };
}

export async function updateExpense(input: UpdateExpenseInput): Promise<Expense> {
  if (await hasActiveAttributedSettlementForExpense(input.id)) {
    throw new SettlementAttributedError();
  }
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
  if (await hasActiveAttributedSettlementForExpense(id)) {
    throw new SettlementAttributedError();
  }
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
