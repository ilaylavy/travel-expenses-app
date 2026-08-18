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

export type SyncQueueBatchItem = {
  tableName: SyncTable;
  recordId: string;
  action: SyncAction;
  payload: Record<string, unknown>;
};

export async function enqueueSyncBatch(
  db: SQLiteDatabase,
  items: SyncQueueBatchItem[],
): Promise<void> {
  if (items.length === 0) return;

  const now = new Date().toISOString();
  const values: unknown[] = [];
  const placeholders: string[] = [];

  for (const item of items) {
    placeholders.push('(?, ?, ?, ?, ?)');
    values.push(
      item.tableName,
      item.recordId,
      item.action,
      JSON.stringify(item.payload),
      now
    );
  }

  // SQLite hard limit is typically 999 or 32766 variables depending on version.
  // We chunk by 500 items (2500 variables) to be safe.
  const chunkSize = 500;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunkPlaceholders = placeholders.slice(i, i + chunkSize);
    const chunkValues = values.slice(i * 5, (i + chunkSize) * 5);

    await db.runAsync(
      `INSERT INTO sync_queue (table_name, record_id, action, payload, created_at) VALUES ${chunkPlaceholders.join(', ')};`,
      chunkValues
    );
  }

  requestSync();
}
