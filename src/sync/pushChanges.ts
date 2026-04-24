import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { SyncQueueEntry, SyncTable } from '@/types/sync';

import { formatError } from './errorUtils';
import { getPendingEntries, markError, markSynced } from './syncQueue';

// Dependency order: tables whose rows are referenced by FKs push first.
const TABLE_ORDER: SyncTable[] = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'expenses',
  'expense_photos',
];

// is_archived is stored as INTEGER 0/1 locally but Postgres expects boolean.
// normalizePayload coerces these fields before pushing, and renames any
// pre-migration column names that may still appear in queued payloads.
function normalizePayload(table: SyncTable, payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };

  // Defensive rename: pre-migration payloads carry the old column name.
  if (table === 'expenses' && 'is_excluded_from_metrics' in out) {
    if (!('is_excluded_from_daily_metrics' in out)) {
      out.is_excluded_from_daily_metrics = out.is_excluded_from_metrics;
    }
    delete out.is_excluded_from_metrics;
  }

  const boolFields: Record<SyncTable, string[]> = {
    profiles: [],
    trips: [],
    trip_members: [],
    categories: ['is_archived'],
    expenses: ['is_refund', 'is_excluded_from_daily_metrics', 'is_private'],
    expense_photos: [],
  };
  for (const field of boolFields[table]) {
    const v = out[field];
    if (v === 0 || v === 1) out[field] = v === 1;
  }
  return out;
}

async function pushEntry(
  supabase: SupabaseClient,
  entry: SyncQueueEntry,
): Promise<void> {
  const payload = normalizePayload(entry.tableName, JSON.parse(entry.payload));

  // Defense in depth: global-default categories (trip_id IS NULL) are
  // server-managed. Never try to push them — RLS forbids it anyway, and
  // reconcileDefaults keeps the local copies aligned.
  if (entry.tableName === 'categories' && payload.trip_id == null) {
    return;
  }

  if (entry.action === 'create') {
    if (entry.tableName === 'trip_members') {
      // Remote trigger add_owner_to_trip_members() may have already created
      // the owner row with a different uuid; skip duplicates on (trip_id,user_id).
      const { error } = await supabase
        .from('trip_members')
        .upsert(payload, { onConflict: 'trip_id,user_id', ignoreDuplicates: true });
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from(entry.tableName)
      .upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    return;
  }

  if (entry.action === 'update' || entry.action === 'delete') {
    const id = payload.id as string | undefined;
    if (!id) throw new Error(`missing id in ${entry.action} payload`);
    const { id: _omit, ...rest } = payload;
    void _omit;
    const { error } = await supabase.from(entry.tableName).update(rest).eq('id', id);
    if (error) throw error;
    return;
  }
}

export async function pushChanges(
  db: SQLiteDatabase,
  supabase: SupabaseClient,
): Promise<{ pushed: number; failed: number }> {
  const entries = await getPendingEntries(db);
  if (entries.length === 0) return { pushed: 0, failed: 0 };

  // Group by table, keep insertion order within each group.
  const grouped = new Map<SyncTable, SyncQueueEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.tableName) ?? [];
    list.push(entry);
    grouped.set(entry.tableName, list);
  }

  let pushed = 0;
  let failed = 0;

  for (const table of TABLE_ORDER) {
    const tableEntries = grouped.get(table);
    if (!tableEntries) continue;
    for (const entry of tableEntries) {
      try {
        await pushEntry(supabase, entry);
        await markSynced(db, entry.id);
        pushed += 1;
      } catch (err) {
        const message = formatError(err);
        await markError(db, entry.id, message);
        failed += 1;
        console.warn(`sync: push failed for ${table} ${entry.recordId}: ${message}`);
      }
    }
  }

  return { pushed, failed };
}
