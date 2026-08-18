import type { SQLiteDatabase } from 'expo-sqlite';

import { requestSync } from '@/sync/triggerDebounced';
import type { SyncAction, SyncTable } from '@/types/sync';

export async function enqueueSync(
  db: SQLiteDatabase,
  tableName: SyncTable,
  recordId: string,
  action: SyncAction,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.runAsync(
    'INSERT INTO sync_queue (table_name, record_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?);',
    [tableName, recordId, action, JSON.stringify(payload), new Date().toISOString()],
  );
  // Schedule a sync cycle. Debounced so a transaction enqueuing several rows
  // (or several mutations in quick succession) fires one sync, not N.
  requestSync();
}

export async function enqueueSyncBatch(
  db: SQLiteDatabase,
  items: {
    tableName: SyncTable;
    recordId: string;
    action: SyncAction;
    payload: Record<string, unknown>;
  }[],
): Promise<void> {
  if (items.length === 0) return;

  const now = new Date().toISOString();

  // SQLite limits variables per query to 999 by default (SQLite < 3.32) or 32766.
  // We use 5 variables per item, so 99 items is 495 variables (very safe).
  const CHUNK_SIZE = 99;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const values = chunk.flatMap((item) => [
      item.tableName,
      item.recordId,
      item.action,
      JSON.stringify(item.payload),
      now,
    ]);

    await db.runAsync(
      `INSERT INTO sync_queue (table_name, record_id, action, payload, created_at) VALUES ${placeholders};`,
      values,
    );
  }

  requestSync();
}
