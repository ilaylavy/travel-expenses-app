import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import { deleteLocalPhoto } from '@/services/photoService';
import type { ExpensePhoto, ExpensePhotoRow } from '@/types/expense';

import type { ExpensePhotosQueries } from './contract';
import { enqueueSync } from './syncQueue';

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

// Delete a single photo on a saved expense. expense_photos is hard-deleted
// (no deleted_at column), so we drop the row, queue a sync delete that
// carries the storage_path through to pushChanges (which removes the R2
// object server-side), and best-effort clean up the local file.
export async function deletePhoto(photo: ExpensePhoto): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM expense_photos WHERE id = ?;', [photo.id]);
    await enqueueSync(db, 'expense_photos', photo.id, 'delete', {
      id: photo.id,
      storage_path: photo.storagePath,
    });
  });
  // Local file cleanup is best-effort and runs outside the transaction so
  // a missing file can't block the DB delete.
  await deleteLocalPhoto(photo.localUri);
}

const _check: ExpensePhotosQueries = {
  listPhotosForExpense,
  deletePhoto,
};
void _check;
