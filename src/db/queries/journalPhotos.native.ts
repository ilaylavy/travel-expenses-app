// Children of journal_photo_entries. Used by the sync engine's upload step.

import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type { JournalPhoto, JournalPhotoRow } from '@/types/journal';

function rowToPhoto(r: JournalPhotoRow): JournalPhoto {
  return {
    id: r.id,
    entryId: r.entry_id,
    storagePath: r.storage_path,
    localUri: r.local_uri,
    sortOrder: r.sort_order,
    exifTakenAt: r.exif_taken_at,
    createdAt: r.created_at,
  };
}

export async function getPhotoById(
  db: SQLiteDatabase,
  id: string,
): Promise<JournalPhoto | null> {
  const row = await db.getFirstAsync<JournalPhotoRow>(
    'SELECT * FROM journal_photos WHERE id = ?;',
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
    'UPDATE journal_photos SET storage_path = ? WHERE id = ?;',
    [storagePath, id],
  );
}

export async function listPhotosForEntry(entryId: string): Promise<JournalPhoto[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<JournalPhotoRow>(
    'SELECT * FROM journal_photos WHERE entry_id = ? ORDER BY sort_order ASC;',
    [entryId],
  );
  return rows.map(rowToPhoto);
}

// Used when a photo entry is soft-deleted: get every R2 key + local file
// path so the upstream caller can request server-side R2 deletes and best-
// effort local cleanup.
export async function listPhotoArtifactsForEntry(
  entryId: string,
): Promise<Array<{ id: string; storagePath: string; localUri: string | null }>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    storage_path: string;
    local_uri: string | null;
  }>(
    'SELECT id, storage_path, local_uri FROM journal_photos WHERE entry_id = ?;',
    [entryId],
  );
  return rows.map((r) => ({ id: r.id, storagePath: r.storage_path, localUri: r.local_uri }));
}
