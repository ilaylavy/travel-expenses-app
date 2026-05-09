import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type { ExpensePhoto, ExpensePhotoRow } from '@/types/expense';

import type { ExpensePhotosQueries } from './contract';

export function rowToPhoto(row: ExpensePhotoRow): ExpensePhoto {
  return {
    id: row.id,
    expenseId: row.expense_id,
    storagePath: row.storage_path,
    localUri: row.local_uri,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function photoToPayload(p: ExpensePhoto): Record<string, unknown> {
  return {
    id: p.id,
    expense_id: p.expenseId,
    storage_path: p.storagePath,
    local_uri: p.localUri,
    sort_order: p.sortOrder,
    created_at: p.createdAt,
  };
}

export async function insertPhoto(
  db: SQLiteDatabase,
  p: ExpensePhoto,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO expense_photos
       (id, expense_id, storage_path, local_uri, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [p.id, p.expenseId, p.storagePath, p.localUri, p.sortOrder, p.createdAt],
  );
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

const _check: ExpensePhotosQueries = {
  listPhotosForExpense,
};
void _check;
