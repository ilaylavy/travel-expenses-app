import type { SQLiteDatabase } from 'expo-sqlite';

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
}
