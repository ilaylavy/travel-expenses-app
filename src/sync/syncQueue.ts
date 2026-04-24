import type { SQLiteDatabase } from 'expo-sqlite';

import type { PullTable, SyncAction, SyncQueueEntry, SyncTable } from '@/types/sync';

interface SyncQueueRow {
  id: number;
  table_name: SyncTable;
  record_id: string;
  action: SyncAction;
  payload: string;
  created_at: string;
  synced_at: string | null;
  error: string | null;
}

function rowToEntry(row: SyncQueueRow): SyncQueueEntry {
  return {
    id: row.id,
    tableName: row.table_name,
    recordId: row.record_id,
    action: row.action,
    payload: row.payload,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
    error: row.error,
  };
}

export async function getPendingEntries(
  db: SQLiteDatabase,
  limit = 500,
): Promise<SyncQueueEntry[]> {
  const rows = await db.getAllAsync<SyncQueueRow>(
    'SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY id ASC LIMIT ?;',
    [limit],
  );
  return rows.map(rowToEntry);
}

export async function markSynced(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(
    'UPDATE sync_queue SET synced_at = ?, error = NULL WHERE id = ?;',
    [new Date().toISOString(), id],
  );
}

export async function markError(
  db: SQLiteDatabase,
  id: number,
  message: string,
): Promise<void> {
  await db.runAsync('UPDATE sync_queue SET error = ? WHERE id = ?;', [message, id]);
}

export async function getPendingCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM sync_queue WHERE synced_at IS NULL;',
  );
  return row?.count ?? 0;
}

export async function getLastPulledAt(
  db: SQLiteDatabase,
  table: PullTable,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?;',
    [`last_pulled_${table}`],
  );
  return row?.value ?? null;
}

export async function setLastPulledAt(
  db: SQLiteDatabase,
  table: PullTable,
  isoTimestamp: string,
): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?);',
    [`last_pulled_${table}`, isoTimestamp],
  );
}
