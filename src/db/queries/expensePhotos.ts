import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type { ExpensePhoto } from '@/types/expense';

interface ExpensePhotoRow {
  id: string;
  expense_id: string;
  storage_path: string;
  local_uri: string | null;
  sort_order: number;
  created_at: string;
}

function rowToPhoto(row: ExpensePhotoRow): ExpensePhoto {
  return {
    id: row.id,
    expenseId: row.expense_id,
    storagePath: row.storage_path,
    localUri: row.local_uri,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function getPhotoById(
  db: SQLiteDatabase,
  id: string,
): Promise<ExpensePhoto | null> {
  const row = await db.getFirstAsync<ExpensePhotoRow>(
    'SELECT * FROM expense_photos WHERE id = ?;',
    [id],
  );
  return row ? rowToPhoto(row) : null;
}

export async function setPhotoStoragePath(
  db: SQLiteDatabase,
  id: string,
  storagePath: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE expense_photos SET storage_path = ? WHERE id = ?;',
    [storagePath, id],
  );
}

export async function listPhotosForExpense(
  expenseId: string,
): Promise<ExpensePhoto[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpensePhotoRow>(
    'SELECT * FROM expense_photos WHERE expense_id = ? ORDER BY sort_order ASC;',
    [expenseId],
  );
  return rows.map(rowToPhoto);
}
