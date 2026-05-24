// Web variant — talks to Postgres directly (no local SQLite). Most read
// functions issue a Supabase query; mutations go through the same client
// (sync_queue is native-only).

import { supabase } from '@/services/supabase';
import { newId } from '@/utils/id';
import type {
  JournalPhoto,
  JournalPhotoEntry,
  JournalPhotoEntryWithPhotos,
} from '@/types/journal';

import type { JournalPhotoEntriesQueries } from './contract';

function rowToEntry(r: Record<string, unknown>): JournalPhotoEntry {
  return {
    id: String(r.id),
    tripId: String(r.trip_id),
    userId: String(r.user_id),
    occurredAt: String(r.occurred_at),
    caption: r.caption == null ? null : String(r.caption),
    isPrivate: Boolean(r.is_private),
    momentId: r.moment_id == null ? null : String(r.moment_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: r.deleted_at == null ? null : String(r.deleted_at),
  };
}

function rowToPhoto(r: Record<string, unknown>): JournalPhoto {
  return {
    id: String(r.id),
    entryId: String(r.entry_id),
    storagePath: String(r.storage_path ?? ''),
    localUri: null,
    sortOrder: Number(r.sort_order ?? 0),
    exifTakenAt: r.exif_taken_at == null ? null : String(r.exif_taken_at),
    createdAt: String(r.created_at),
  };
}

export async function listEntriesForDay(
  tripId: string,
  dayDateISO: string,
): Promise<JournalPhotoEntryWithPhotos[]> {
  // Postgres-side: occurred_at::date = $dayDate
  const start = `${dayDateISO}T00:00:00Z`;
  const end = `${dayDateISO}T23:59:59.999Z`;
  const { data: entries, error } = await supabase
    .from('journal_photo_entries')
    .select('*, journal_photos(*)')
    .eq('trip_id', tripId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: true });
  if (error) throw error;
  return (entries ?? []).map((row) => {
    const photos = ((row as { journal_photos?: Record<string, unknown>[] }).journal_photos ?? [])
      .map(rowToPhoto)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { ...rowToEntry(row), photos };
  });
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
  const entryId = newId();
  const now = new Date().toISOString();
  const { data: entry, error } = await supabase
    .from('journal_photo_entries')
    .insert({
      id: entryId,
      trip_id: input.tripId,
      user_id: input.userId,
      occurred_at: input.occurredAt,
      caption: input.caption,
      is_private: input.isPrivate,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  // On web we have no local file to upload; if the caller passed photo refs
  // they must already be uploadable URLs — but realistically the journal
  // capture flow on web is out of scope today. Return an empty photos list.
  return { ...rowToEntry(entry), photos: [] };
}

export async function updateEntryCaption(
  entryId: string,
  caption: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('journal_photo_entries')
    .update({ caption })
    .eq('id', entryId);
  if (error) throw error;
}

export async function updateEntryOccurredAt(
  entryId: string,
  occurredAtISO: string,
): Promise<void> {
  const { error } = await supabase
    .from('journal_photo_entries')
    .update({ occurred_at: occurredAtISO })
    .eq('id', entryId);
  if (error) throw error;
}

export async function updateEntryPrivacy(entryId: string, isPrivate: boolean): Promise<void> {
  const { error } = await supabase
    .from('journal_photo_entries')
    .update({ is_private: isPrivate })
    .eq('id', entryId);
  if (error) throw error;
}

export async function softDeleteEntry(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('journal_photo_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', entryId);
  if (error) throw error;
}

export async function countPhotosForTripDay(
  tripId: string,
  dayDateISO: string,
): Promise<number> {
  const start = `${dayDateISO}T00:00:00Z`;
  const end = `${dayDateISO}T23:59:59.999Z`;
  const { count, error } = await supabase
    .from('journal_photo_entries')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function firstPhotoStoragePathForDay(
  tripId: string,
  dayDateISO: string,
): Promise<string | null> {
  const list = await listEntriesForDay(tripId, dayDateISO);
  for (const entry of list) {
    if (entry.photos.length > 0) return entry.photos[0].storagePath;
  }
  return null;
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
