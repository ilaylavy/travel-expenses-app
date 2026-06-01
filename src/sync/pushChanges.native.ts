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
  'journal_moments',           // NEW — before any moment_id FK consumers
  'expenses',
  'expense_splits',
  'expense_photos',
  'settlement_payments',
  'journal_photo_entries',     // parent of journal_photos
  'journal_photos',
  'voice_clips',
  'journal_days',              // references journal_photo_entries(cover) — must push after
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
    kind: 'expense-photo',
    tripId,
    expenseId: photo.expenseId,
    photoId,
    localUri: photo.localUri,
  });
  await setPhotoStoragePath(db, photoId, storagePath);
  payload.storage_path = storagePath;
}

// For a journal_photos create entry, upload the file to R2 (key
// <tripId>/journal/<photoId>.jpg). Look up the parent entry to derive trip_id.
// Stamp the resulting storage_path back into the local DB and the outgoing
// payload. Throw on failure so the existing markError path retries.
async function uploadJournalPhotoForEntry(
  db: SQLiteDatabase,
  payload: Record<string, unknown>,
): Promise<void> {
  const photoId = payload.id as string | undefined;
  if (!photoId) return;
  const { getPhotoById: getJournalPhotoById, setPhotoStoragePath: setJournalStoragePath } =
    await import('@/db/queries/journalPhotos');
  const photo = await getJournalPhotoById(db, photoId);
  if (!photo) return;
  if (photo.storagePath) {
    payload.storage_path = photo.storagePath;
    return;
  }
  if (!photo.localUri) return;
  const row = await db.getFirstAsync<{ trip_id: string }>(
    'SELECT trip_id FROM journal_photo_entries WHERE id = ?;',
    [photo.entryId],
  );
  if (!row?.trip_id) {
    throw new Error(`journal_photos: parent entry ${photo.entryId} not found`);
  }
  const storagePath = await uploadPhotoToStorage({
    kind: 'journal-photo',
    tripId: row.trip_id,
    photoId,
    localUri: photo.localUri,
  });
  await setJournalStoragePath(db, photoId, storagePath);
  payload.storage_path = storagePath;
}

// Voice clips: upload audio to R2 (key <tripId>/<clipId>.m4a), stamp the path
// back into the row + payload. Caller fire-and-forgets transcribe-voice after
// the row reaches Postgres.
async function uploadVoiceClipForEntry(
  db: SQLiteDatabase,
  payload: Record<string, unknown>,
): Promise<void> {
  const clipId = payload.id as string | undefined;
  if (!clipId) return;
  const { getClipById, setClipStoragePath } = await import('@/db/queries/voiceClips');
  const clip = await getClipById(db, clipId);
  if (!clip) return;
  if (clip.storagePath) {
    payload.storage_path = clip.storagePath;
    return;
  }
  if (!clip.localUri) return;
  const { uploadVoiceClipToStorage } = await import('@/services/voiceClipService');
  const storagePath = await uploadVoiceClipToStorage({
    tripId: clip.tripId,
    clipId,
    localUri: clip.localUri,
  });
  await setClipStoragePath(db, clipId, storagePath);
  payload.storage_path = storagePath;
}

// Fire-and-forget the transcribe Edge Function after a voice_clip row has
// been pushed. Runs outside any DB transaction. Errors are swallowed — the
// UI will surface a "Retry" affordance once transcript_status='pending' has
// been stuck for too long.
async function kickTranscribe(
  supabase: SupabaseClient,
  clipId: string,
): Promise<void> {
  try {
    await supabase.functions.invoke('transcribe-voice', {
      body: { voice_clip_id: clipId },
    });
  } catch (err) {
    console.warn('transcribe-voice invoke failed (will retry on next sync):', err);
  }
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
    if (entry.tableName === 'journal_photos') {
      await uploadJournalPhotoForEntry(db, payload);
    }
    if (entry.tableName === 'voice_clips') {
      await uploadVoiceClipForEntry(db, payload);
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
    // Now that the audio row is in Postgres, fire-and-forget transcription.
    if (entry.tableName === 'voice_clips') {
      void kickTranscribe(supabase, entry.recordId);
    }
    return;
  }

  if (entry.action === 'update' || entry.action === 'delete') {
    const id = payload.id as string | undefined;
    if (!id) throw new Error(`missing id in ${entry.action} payload`);

    // expense_photos: 'delete' is a real hard-delete (the row carries no
    // deleted_at column), and the Storage object must be removed too.
    if (entry.action === 'delete' && entry.tableName === 'expense_photos') {
      await deletePhotoFromStorage(payload.storage_path as string | undefined, 'expense-photo');
      const { error } = await supabase.from('expense_photos').delete().eq('id', id);
      if (error) throw error;
      return;
    }

    // journal_photo_entries soft-delete: best-effort R2 cleanup for every
    // child photo. The payload only carries the parent id, so look up the
    // children locally before they're cascaded off the device.
    if (entry.action === 'delete' && entry.tableName === 'journal_photo_entries') {
      const { listPhotoArtifactsForEntry } = await import('@/db/queries/journalPhotos');
      const artifacts = await listPhotoArtifactsForEntry(entry.recordId);
      for (const a of artifacts) {
        if (a.storagePath) {
          void deletePhotoFromStorage(a.storagePath, 'journal-photo').catch(() => undefined);
        }
      }
    }

    // voice_clips soft-delete: clean up the audio object server-side.
    if (entry.action === 'delete' && entry.tableName === 'voice_clips') {
      const storagePath = (payload.storage_path as string | undefined) ?? '';
      if (storagePath) {
        const { deleteVoiceClipFromStorage } = await import('@/services/voiceClipService');
        void deleteVoiceClipFromStorage(storagePath).catch(() => undefined);
      }
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
