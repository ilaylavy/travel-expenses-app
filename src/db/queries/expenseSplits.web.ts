// Web build of the expense_splits query module. Reads/writes go directly
// to Supabase. The Postgres trigger from Phase 0 maintains expenses.is_split,
// so this module mirrors the native one in not touching that flag.

import { supabase } from '@/services/supabase';
import type {
  CreateSplitInput,
  ExpenseSplit,
} from '@/types/expense';

import type { ExpenseSplitsQueries } from './contract';

export type { CreateSplitInput };

interface RemoteSplitRow {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number | string;
  is_payer: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function asNumber(v: number | string): number {
  return typeof v === 'number' ? v : Number(v);
}

function rowToSplit(row: RemoteSplitRow): ExpenseSplit {
  return {
    id: row.id,
    expenseId: row.expense_id,
    userId: row.user_id,
    amount: asNumber(row.amount),
    isPayer: row.is_payer,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export async function getSplitsForExpense(
  expenseId: string,
): Promise<ExpenseSplit[]> {
  const { data, error } = await supabase
    .from('expense_splits')
    .select('*')
    .eq('expense_id', expenseId)
    .is('deleted_at', null)
    .order('is_payer', { ascending: false })
    .order('amount', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RemoteSplitRow[]).map(rowToSplit);
}

export async function getSplitsForTrip(tripId: string): Promise<ExpenseSplit[]> {
  // Two-step join: pull non-deleted expense ids for the trip, then their
  // non-deleted splits. PostgREST's nested-resource select can return the
  // splits embedded, but a flat query keeps the row shape identical to native.
  const { data: expenseIds, error: expenseError } = await supabase
    .from('expenses')
    .select('id')
    .eq('trip_id', tripId)
    .is('deleted_at', null);
  if (expenseError) throw expenseError;
  const ids = (expenseIds ?? []).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('expense_splits')
    .select('*')
    .in('expense_id', ids)
    .is('deleted_at', null);
  if (error) throw error;
  return ((data ?? []) as RemoteSplitRow[]).map(rowToSplit);
}

export async function createSplits(
  expenseId: string,
  splits: CreateSplitInput[],
): Promise<ExpenseSplit[]> {
  if (splits.length === 0) return [];
  const { data, error } = await supabase
    .from('expense_splits')
    .insert(
      splits.map((s) => ({
        expense_id: expenseId,
        user_id: s.userId,
        amount: s.amount,
        is_payer: s.isPayer,
      })),
    )
    .select('*');
  if (error) throw error;
  return ((data ?? []) as RemoteSplitRow[]).map(rowToSplit);
}

export async function updateSplits(
  expenseId: string,
  splits: CreateSplitInput[],
): Promise<ExpenseSplit[]> {
  // Upsert by (expense_id, user_id). The Postgres UNIQUE constraint on those
  // columns is full-table, so the old soft-delete-then-insert pattern would
  // collide with any leftover soft-deleted row from a prior edit. Upserting
  // reuses the existing row's id, clears deleted_at if it was previously
  // soft-deleted, and keeps the sync trail intact.
  const now = new Date().toISOString();

  // 1. Find users that should drop out of the split and soft-delete those
  //    rows. Pulling all (any deleted_at state) so the diff is accurate.
  const { data: existing, error: fetchError } = await supabase
    .from('expense_splits')
    .select('id, user_id, deleted_at')
    .eq('expense_id', expenseId);
  if (fetchError) throw fetchError;

  const incomingUserIds = new Set(splits.map((s) => s.userId));
  const toSoftDelete = (existing ?? [])
    .filter((r) => r.deleted_at === null && !incomingUserIds.has(r.user_id))
    .map((r) => r.id);
  if (toSoftDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('expense_splits')
      .update({ deleted_at: now, updated_at: now })
      .in('id', toSoftDelete);
    if (deleteError) throw deleteError;
  }

  if (splits.length === 0) return [];

  // 2. Upsert the new set. Setting deleted_at: null in the payload resurrects
  //    any previously soft-deleted row for that (expense_id, user_id) pair.
  //    The BEFORE UPDATE trigger overrides updated_at on conflict; for fresh
  //    inserts the default now() populates created_at/updated_at.
  const { data, error } = await supabase
    .from('expense_splits')
    .upsert(
      splits.map((s) => ({
        expense_id: expenseId,
        user_id: s.userId,
        amount: s.amount,
        is_payer: s.isPayer,
        deleted_at: null,
      })),
      { onConflict: 'expense_id,user_id' },
    )
    .select('*');
  if (error) throw error;
  return ((data ?? []) as RemoteSplitRow[]).map(rowToSplit);
}

export async function deleteSplits(expenseId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('expense_splits')
    .update({ deleted_at: now, updated_at: now })
    .eq('expense_id', expenseId)
    .is('deleted_at', null);
  if (error) throw error;
}

const _check: ExpenseSplitsQueries = {
  getSplitsForExpense,
  getSplitsForTrip,
  createSplits,
  updateSplits,
  deleteSplits,
};
void _check;
