import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import { newId } from '@/utils/id';
import type {
  JournalPhoto,
  JournalPhotoEntry,
  JournalPhotoEntryRow,
  JournalPhotoEntryWithPhotos,
  JournalPhotoRow,
} from '@/types/journal';

import type { JournalPhotoEntriesQueries } from './contract';
import { enqueueSync } from './syncQueue';

function rowToEntry(r: JournalPhotoEntryRow): JournalPhotoEntry {
  return {
    id: r.id,
    tripId: r.trip_id,
    userId: r.user_id,
    occurredAt: r.occurred_at,
    caption: r.caption,
    isPrivate: r.is_private === 1,
    momentId: r.moment_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

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

export function entryToPayload(e: JournalPhotoEntry): Record<string, unknown> {
  return {
    id: e.id,
    trip_id: e.tripId,
    user_id: e.userId,
    occurred_at: e.occurredAt,
    caption: e.caption,
    is_private: e.isPrivate ? 1 : 0,
    moment_id: e.momentId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
  };
}

export function photoToPayload(p: JournalPhoto): Record<string, unknown> {
  return {
    id: p.id,
    entry_id: p.entryId,
    storage_path: p.storagePath,
    local_uri: p.localUri,
    sort_order: p.sortOrder,
    exif_taken_at: p.exifTakenAt,
    created_at: p.createdAt,
  };
}

// Used by the sync engine's photo-upload step.
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

// Day-boundary helper: an ISO timestamp falls into a day if its local-date
// portion equals the given dayDateISO (YYYY-MM-DD). The SQLite expression
// SUBSTR(occurred_at, 1, 10) returns the date portion — works because we
// store ISO-8601 with timezone, and the user's local-timezone day is what
// matters for grouping.
export async function listEntriesForDay(
  tripId: string,
  dayDateISO: string,
): Promise<JournalPhotoEntryWithPhotos[]> {
  const db = await getDatabase();
  const entries = await db.getAllAsync<JournalPhotoEntryRow>(
    `SELECT * FROM journal_photo_entries
      WHERE trip_id = ?
        AND SUBSTR(occurred_at, 1, 10) = ?
        AND deleted_at IS NULL
      ORDER BY occurred_at ASC;`,
    [tripId, dayDateISO],
  );
  if (entries.length === 0) return [];
  const entryIds = entries.map((e) => e.id);
  const placeholders = entryIds.map(() => '?').join(',');
  const photos = await db.getAllAsync<JournalPhotoRow>(
    `SELECT * FROM journal_photos
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id ASC, sort_order ASC;`,
    entryIds,
  );
  const photosByEntry = new Map<string, JournalPhoto[]>();
  for (const p of photos) {
    const list = photosByEntry.get(p.entry_id) ?? [];
    list.push(rowToPhoto(p));
    photosByEntry.set(p.entry_id, list);
  }
  return entries.map((e) => ({
    ...rowToEntry(e),
    photos: photosByEntry.get(e.id) ?? [],
  }));
}

export async function createEntry(input: {
  tripId: string;
  userId: string;
  occurredAt: string;
  caption: string | null;
  isPrivate: boolean;
  photos: Array<{
    localUri: string;
    sortOrder: number;
    exifTakenAt: string | null;
  }>;
}): Promise<JournalPhotoEntryWithPhotos> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const entryId = newId();
  const entry: JournalPhotoEntry = {
    id: entryId,
    tripId: input.tripId,
    userId: input.userId,
    occurredAt: input.occurredAt,
    caption: input.caption,
    isPrivate: input.isPrivate,
    momentId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const photos: JournalPhoto[] = input.photos.map((p) => ({
    id: newId(),
    entryId,
    storagePath: '',                 // filled after R2 upload
    localUri: p.localUri,
    sortOrder: p.sortOrder,
    exifTakenAt: p.exifTakenAt,
    createdAt: now,
  }));

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO journal_photo_entries
         (id, trip_id, user_id, occurred_at, caption, is_private, moment_id,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL);`,
      [
        entry.id, entry.tripId, entry.userId, entry.occurredAt,
        entry.caption, entry.isPrivate ? 1 : 0,
        entry.createdAt, entry.updatedAt,
      ],
    );
    await enqueueSync(db, 'journal_photo_entries', entry.id, 'create', entryToPayload(entry));

    for (const p of photos) {
      await db.runAsync(
        `INSERT INTO journal_photos
           (id, entry_id, storage_path, local_uri, sort_order, exif_taken_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [p.id, p.entryId, p.storagePath, p.localUri, p.sortOrder, p.exifTakenAt, p.createdAt],
      );
      await enqueueSync(db, 'journal_photos', p.id, 'create', photoToPayload(p));
    }
  });

  return { ...entry, photos };
}

export async function updateEntryCaption(
  entryId: string,
  caption: string | null,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE journal_photo_entries SET caption = ?, updated_at = ? WHERE id = ?;',
      [caption, updatedAt, entryId],
    );
    await enqueueSync(db, 'journal_photo_entries', entryId, 'update', {
      id: entryId,
      caption,
      updated_at: updatedAt,
    });
  });
}

export async function updateEntryOccurredAt(
  entryId: string,
  occurredAtISO: string,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE journal_photo_entries SET occurred_at = ?, updated_at = ? WHERE id = ?;',
      [occurredAtISO, updatedAt, entryId],
    );
    await enqueueSync(db, 'journal_photo_entries', entryId, 'update', {
      id: entryId,
      occurred_at: occurredAtISO,
      updated_at: updatedAt,
    });
  });
}

export async function updateEntryPrivacy(
  entryId: string,
  isPrivate: boolean,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE journal_photo_entries SET is_private = ?, updated_at = ? WHERE id = ?;',
      [isPrivate ? 1 : 0, updatedAt, entryId],
    );
    await enqueueSync(db, 'journal_photo_entries', entryId, 'update', {
      id: entryId,
      is_private: isPrivate ? 1 : 0,
      updated_at: updatedAt,
    });
  });
}

export async function softDeleteEntry(entryId: string): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE journal_photo_entries SET deleted_at = ?, updated_at = ? WHERE id = ?;',
      [ts, ts, entryId],
    );
    await enqueueSync(db, 'journal_photo_entries', entryId, 'delete', {
      id: entryId,
      deleted_at: ts,
      updated_at: ts,
    });
  });
}

export async function countPhotosForTripDay(
  tripId: string,
  dayDateISO: string,
): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM journal_photo_entries
      WHERE trip_id = ?
        AND SUBSTR(occurred_at, 1, 10) = ?
        AND deleted_at IS NULL;`,
    [tripId, dayDateISO],
  );
  return row?.c ?? 0;
}

export async function firstPhotoStoragePathForDay(
  tripId: string,
  dayDateISO: string,
): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ storage_path: string }>(
    `SELECT jp.storage_path
       FROM journal_photo_entries jpe
       JOIN journal_photos jp ON jp.entry_id = jpe.id
      WHERE jpe.trip_id = ?
        AND SUBSTR(jpe.occurred_at, 1, 10) = ?
        AND jpe.deleted_at IS NULL
      ORDER BY jpe.occurred_at ASC, jp.sort_order ASC
      LIMIT 1;`,
    [tripId, dayDateISO],
  );
  return row?.storage_path ?? null;
}

const _check: JournalPhotoEntriesQueries = {
  listEntriesForDay,
  createEntry,
  updateEntryCaption,
  updateEntryOccurredAt,
  updateEntryPrivacy,
  softDeleteEntry,
  countPhotosForTripDay,
  firstPhotoStoragePathForDay,
};
void _check;
