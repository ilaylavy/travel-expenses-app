import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getPhotoById, setPhotoStoragePath } from '@/db/queries/expensePhotos';
import {
  deletePhotoFromStorage,
  uploadPhotoToStorage,
} from '@/services/photoService';
import type { SyncQueueEntry, SyncTable } from '@/types/sync';

import { formatError } from './errorUtils';
import { getPendingEntries, markError, markSynced } from './syncQueue';
import { BOOL_FIELDS_BY_TABLE } from './typeCoercion';

// Dependency order: tables whose rows are referenced by FKs push first.
const TABLE_ORDER: SyncTable[] = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'expenses',
  'expense_splits',
  'expense_photos',
  'settlement_payments',
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

  for (const field of BOOL_FIELDS_BY_TABLE[table]) {
    const v = out[field];
    if (v === 0 || v === 1) out[field] = v === 1;
  }
  return out;
}

// Look up the parent expense's trip_id so we can build the storage object key
// (<trip_id>/<expense_id>/<photo_id>.jpg). RLS on storage.objects keys off
// the first path segment.
async function getTripIdForExpense(
  db: SQLiteDatabase,
  expenseId: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ trip_id: string }>(
    'SELECT trip_id FROM expenses WHERE id = ?;',
    [expenseId],
  );
  return row?.trip_id ?? null;
}

// For an expense_photos create entry, upload the locally-persisted file to
// Supabase Storage before the metadata row is upserted. Stamps the resulting
// storage_path back into the local DB and the outgoing payload. If the file
// can't be uploaded, throw — the existing markError path will retry.
async function uploadPhotoForEntry(
  db: SQLiteDatabase,
  payload: Record<string, unknown>,
): Promise<void> {
  const photoId = payload.id as string | undefined;
  if (!photoId) return;
  const photo = await getPhotoById(db, photoId);
  if (!photo) return;
  if (photo.storagePath) {
    payload.storage_path = photo.storagePath;
    return;
  }
  if (!photo.localUri) {
    // No file to upload — leave storage_path empty. Trip partners won't see
    // a thumbnail, but the metadata row still propagates so we don't block sync.
    return;
  }
  const tripId = await getTripIdForExpense(db, photo.expenseId);
  if (!tripId) {
    throw new Error(`expense_photos: parent expense ${photo.expenseId} not found`);
  }
  const storagePath = await uploadPhotoToStorage({
    tripId,
    expenseId: photo.expenseId,
    photoId,
    localUri: photo.localUri,
  });
  await setPhotoStoragePath(db, photoId, storagePath);
  payload.storage_path = storagePath;
}

async function pushEntry(
  db: SQLiteDatabase,
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
    if (entry.tableName === 'expense_photos') {
      await uploadPhotoForEntry(db, payload);
    }
    if (entry.tableName === 'trip_members') {
      // Remote trigger add_owner_to_trip_members() may have already created
      // the owner row with a server-side uuid. Merge-upsert on
      // (trip_id, user_id) so any client-side fields (budget, joined_at)
      // land on the existing row; the row's id ends up matching whichever
      // side wrote last, which is fine because (trip_id, user_id) is the
      // real identity.
      const { error } = await supabase
        .from('trip_members')
        .upsert(payload, { onConflict: 'trip_id,user_id' });
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

    // expense_photos: 'delete' is a real hard-delete (the row carries no
    // deleted_at column), and the Storage object must be removed too.
    if (entry.action === 'delete' && entry.tableName === 'expense_photos') {
      await deletePhotoFromStorage(payload.storage_path as string | undefined);
      const { error } = await supabase.from('expense_photos').delete().eq('id', id);
      if (error) throw error;
      return;
    }

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
        await pushEntry(db, supabase, entry);
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
