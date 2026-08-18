import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { applyRemote } from './conflictResolver';
import { formatError } from './errorUtils';

// One-shot migration: early clients seeded their own uuids for the 8 global
// default categories. The remote had its own canonical uuids for those same
// rows, so every client-seeded default was orphaned (RLS blocks inserts of
// trip_id IS NULL rows, and any expense pointing at a local default had a
// phantom FK target remotely). This reconciler:
//
//   1. Fetches the canonical globals from remote.
//   2. Matches them to local default rows by name.
//   3. Rewrites local expenses.category_id from old local-uuid -> remote-uuid.
//   4. Rewrites any pending sync_queue payloads referencing the old uuid.
//   5. Drops pending sync_queue entries for the old local-default records.
//   6. Deletes the old local default rows.
//   7. Inserts the remote globals locally.
//
// Runs once per install: a sync_metadata row marks completion. Idempotent —
// if the user already has matching ids, the reconciler is still cheap and
// just records the flag.

const DONE_KEY = 'default_categories_reconciled_at';

async function isReconciled(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?;',
    [DONE_KEY],
  );
  return row != null;
}

async function markReconciled(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?);',
    [DONE_KEY, new Date().toISOString()],
  );
}

interface RemoteDefault {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sort_order: number;
  trip_id: string | null;
  created_by: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export async function ensureDefaultsReconciled(
  db: SQLiteDatabase,
  supabase: SupabaseClient,
): Promise<void> {
  if (await isReconciled(db)) return;

  let remoteGlobals: RemoteDefault[];
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .is('trip_id', null);
    if (error) throw error;
    remoteGlobals = (data ?? []) as RemoteDefault[];
  } catch (err) {
    console.warn(`sync: reconcile defaults skipped (offline?): ${formatError(err)}`);
    return; // try again next sync cycle
  }

  if (remoteGlobals.length === 0) {
    // Remote has no canonical globals — nothing to reconcile against yet.
    // Leave the flag unset so we retry later (e.g. after a migration seeds them).
    return;
  }

  const byName = new Map<string, RemoteDefault>();
  for (const row of remoteGlobals) byName.set(row.name, row);

  const localDefaults = await db.getAllAsync<{ id: string; name: string }>(
    'SELECT id, name FROM categories WHERE trip_id IS NULL;',
  );

  // Build old -> new id remap (only entries where local id actually differs).
  const remap = new Map<string, string>();
  for (const local of localDefaults) {
    const remote = byName.get(local.name);
    if (remote && remote.id !== local.id) remap.set(local.id, remote.id);
  }

  await db.withTransactionAsync(async () => {
    for (const [oldId, newId] of remap) {
      // Rewrite expenses.category_id.
      await db.runAsync(
        'UPDATE expenses SET category_id = ? WHERE category_id = ?;',
        [newId, oldId],
      );

      // Rewrite any pending sync_queue payloads referencing the old uuid
      // (both create and update actions for expenses).
      await db.runAsync(
        `UPDATE sync_queue
            SET payload = REPLACE(payload, ?, ?)
          WHERE synced_at IS NULL
            AND payload LIKE ?;`,
        [oldId, newId, `%${oldId}%`],
      );

      // Drop the never-going-to-succeed queue entries for the old local default.
      await db.runAsync(
        `DELETE FROM sync_queue
          WHERE table_name = 'categories'
            AND record_id = ?;`,
        [oldId],
      );

      // Drop the stale local default row itself. Any local trip-scoped
      // category created by the user is untouched (different trip_id / id).
      await db.runAsync('DELETE FROM categories WHERE id = ?;', [oldId]);
    }

    // Finally upsert the authoritative remote globals into local storage.
    for (const row of remoteGlobals) {
      await applyRemote(db, 'categories', row as unknown as Record<string, unknown>);
    }

    await markReconciled(db);
  });
}

const PAYLOAD_RENAME_KEY = 'expense_payload_renamed_excluded_at';

// One-shot: queued expense payloads built before the rename migration still
// carry the old column name "is_excluded_from_metrics", which PostgREST now
// rejects with PGRST204. Rewrite them in-place. Idempotent: a sync_metadata
// row guards against re-running.
export async function ensureExpensePayloadsRenamed(db: SQLiteDatabase): Promise<void> {
  const done = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?;',
    [PAYLOAD_RENAME_KEY],
  );
  if (done) return;

  const result = await db.runAsync(
    `UPDATE sync_queue
        SET payload = REPLACE(payload, ?, ?)
      WHERE table_name = 'expenses'
        AND synced_at IS NULL
        AND payload LIKE ?;`,
    [
      '"is_excluded_from_metrics"',
      '"is_excluded_from_daily_metrics"',
      '%"is_excluded_from_metrics"%',
    ],
  );

  await db.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?);',
    [PAYLOAD_RENAME_KEY, new Date().toISOString()],
  );

  if (result.changes > 0) {
    console.log(`sync: renamed is_excluded_from_metrics in ${result.changes} pending payload${result.changes === 1 ? '' : 's'}`);
  }
}
