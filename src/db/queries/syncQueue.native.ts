import type { SQLiteDatabase } from "expo-sqlite";

import { requestSync } from "@/sync/triggerDebounced";
import type { SyncAction, SyncTable } from "@/types/sync";

export type SyncTask = {
  tableName: SyncTable;
  recordId: string;
  action: SyncAction;
  payload: Record<string, unknown>;
};

export async function enqueueSyncBatch(
  db: SQLiteDatabase,
  tasks: SyncTask[],
): Promise<void> {
  if (tasks.length === 0) return;
  const placeholders = tasks.map(() => "(?, ?, ?, ?, ?)").join(", ");
  const now = new Date().toISOString();
  const args = tasks.flatMap((t) => [
    t.tableName,
    t.recordId,
    t.action,
    JSON.stringify(t.payload),
    now,
  ]);

  await db.runAsync(
    `INSERT INTO sync_queue (table_name, record_id, action, payload, created_at) VALUES ${placeholders};`,
    args,
  );
  requestSync();
}

export async function enqueueSync(
  db: SQLiteDatabase,
  tableName: SyncTable,
  recordId: string,
  action: SyncAction,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.runAsync(
    "INSERT INTO sync_queue (table_name, record_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?);",
    [
      tableName,
      recordId,
      action,
      JSON.stringify(payload),
      new Date().toISOString(),
    ],
  );
  // Schedule a sync cycle. Debounced so a transaction enqueuing several rows
  // (or several mutations in quick succession) fires one sync, not N.
  requestSync();
}
