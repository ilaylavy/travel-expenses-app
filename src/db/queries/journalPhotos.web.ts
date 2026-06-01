// Web variant — passthrough to Supabase for the read helpers used by web UI.
// The sync-engine-only helpers (getPhotoById, setPhotoStoragePath) are
// native-only — they take a SQLiteDatabase, which doesn't exist on web.

import { supabase } from '@/services/supabase';
import type { JournalPhoto } from '@/types/journal';

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

export async function listPhotosForEntry(entryId: string): Promise<JournalPhoto[]> {
  const { data, error } = await supabase
    .from('journal_photos')
    .select('*')
    .eq('entry_id', entryId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPhoto);
}

export async function listPhotoArtifactsForEntry(
  entryId: string,
): Promise<Array<{ id: string; storagePath: string; localUri: string | null }>> {
  const { data, error } = await supabase
    .from('journal_photos')
    .select('id, storage_path')
    .eq('entry_id', entryId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String((r as Record<string, unknown>).id),
    storagePath: String((r as Record<string, unknown>).storage_path ?? ''),
    localUri: null,
  }));
}
