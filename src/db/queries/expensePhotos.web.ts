// Web build of the expense_photos query module. Web only needs the read side
// — uploads happen inline in createExpense.web.ts (Phase 4) and are written
// straight to Supabase Storage; sync-engine helpers from the native variant
// (insertPhoto, photoToPayload, getPhotoById, setPhotoStoragePath) have no
// equivalent on web because there is no local DB or sync queue.

import { supabase } from '@/services/supabase';
import type { ExpensePhoto } from '@/types/expense';

import type { ExpensePhotosQueries } from './contract';

interface RemoteExpensePhotoRow {
  id: string;
  expense_id: string;
  storage_path: string;
  local_uri: string | null;
  sort_order: number;
  created_at: string;
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

export async function listPhotosForExpense(
  expenseId: string,
): Promise<ExpensePhoto[]> {
  const { data, error } = await supabase
    .from('expense_photos')
    .select('*')
    .eq('expense_id', expenseId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RemoteExpensePhotoRow[]).map(rowToPhoto);
}

const _check: ExpensePhotosQueries = {
  listPhotosForExpense,
};
void _check;
