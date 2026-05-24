// Web variant — Postgres-side equivalent of the SQLite recursive CTE in the
// native version. We pull the parent trip, build the date range in JS, and
// fan out simple count queries.

import { supabase } from '@/services/supabase';
import { newId } from '@/utils/id';
import type { DaySummary, JournalDay } from '@/types/journal';

import type { JournalDaysQueries } from './contract';

function rowToDay(r: Record<string, unknown>): JournalDay {
  return {
    id: String(r.id),
    tripId: String(r.trip_id),
    dayDate: String(r.day_date),
    location: r.location == null ? null : String(r.location),
    coverPhotoEntryId:
      r.cover_photo_entry_id == null ? null : String(r.cover_photo_entry_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: r.deleted_at == null ? null : String(r.deleted_at),
  };
}

export async function getDayMetadata(
  tripId: string,
  dayDateISO: string,
): Promise<JournalDay | null> {
  const { data, error } = await supabase
    .from('journal_days')
    .select('*')
    .eq('trip_id', tripId)
    .eq('day_date', dayDateISO)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDay(data) : null;
}

async function upsertDay(
  tripId: string,
  dayDateISO: string,
  patch: { location?: string | null; cover_photo_entry_id?: string | null },
): Promise<JournalDay> {
  const existing = await getDayMetadata(tripId, dayDateISO);
  if (existing) {
    const { data, error } = await supabase
      .from('journal_days')
      .update(patch)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return rowToDay(data);
  }
  const { data, error } = await supabase
    .from('journal_days')
    .insert({
      id: newId(),
      trip_id: tripId,
      day_date: dayDateISO,
      ...patch,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToDay(data);
}

export async function setLocation(
  tripId: string,
  dayDateISO: string,
  location: string | null,
): Promise<JournalDay> {
  return upsertDay(tripId, dayDateISO, { location });
}

export async function setCoverPhotoEntry(
  tripId: string,
  dayDateISO: string,
  entryId: string | null,
): Promise<JournalDay> {
  return upsertDay(tripId, dayDateISO, { cover_photo_entry_id: entryId });
}

export async function listDaySummaries(
  tripId: string,
  currentUserId: string,
): Promise<DaySummary[]> {
  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('start_date, end_date')
    .eq('id', tripId)
    .single();
  if (tripErr) throw tripErr;
  if (!trip) return [];

  const endDate = trip.end_date ?? new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  const start = new Date(`${trip.start_date}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (
    let d = start;
    d.getTime() <= end.getTime() && dates.length < 366;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    dates.push(d.toISOString().slice(0, 10));
  }

  // For each day, run small queries in parallel. Acceptable on web — fewer
  // rows than native (no offline cache), and the chapter view is not opened
  // often.
  const summaries: DaySummary[] = [];
  for (const day of dates.reverse()) {
    const dayStart = `${day}T00:00:00Z`;
    const dayEnd = `${day}T23:59:59.999Z`;

    const [
      { count: photoCount },
      { count: voiceCount },
      { count: expenseCount },
      totals,
      override,
      inferred,
      coverPath,
    ] = await Promise.all([
      supabase.from('journal_photo_entries').select('id', { count: 'exact', head: true })
        .eq('trip_id', tripId).gte('occurred_at', dayStart).lte('occurred_at', dayEnd)
        .is('deleted_at', null).or(`is_private.eq.false,user_id.eq.${currentUserId}`),
      supabase.from('voice_clips').select('id', { count: 'exact', head: true })
        .eq('trip_id', tripId).gte('occurred_at', dayStart).lte('occurred_at', dayEnd)
        .is('deleted_at', null).or(`is_private.eq.false,user_id.eq.${currentUserId}`),
      supabase.from('expenses').select('id', { count: 'exact', head: true })
        .eq('trip_id', tripId).eq('expense_date', day)
        .is('deleted_at', null).or(`is_private.eq.false,user_id.eq.${currentUserId}`),
      supabase.from('expenses').select('converted_amount')
        .eq('trip_id', tripId).eq('expense_date', day)
        .is('deleted_at', null).eq('is_excluded_from_daily_metrics', false)
        .or(`is_private.eq.false,user_id.eq.${currentUserId}`),
      supabase.from('journal_days').select('location, cover_photo_entry_id')
        .eq('trip_id', tripId).eq('day_date', day).is('deleted_at', null).maybeSingle(),
      supabase.from('expenses').select('place_name')
        .eq('trip_id', tripId).eq('expense_date', day)
        .is('deleted_at', null).not('place_name', 'is', null)
        .or(`is_private.eq.false,user_id.eq.${currentUserId}`),
      supabase.from('journal_photo_entries').select('journal_photos(storage_path), occurred_at')
        .eq('trip_id', tripId).gte('occurred_at', dayStart).lte('occurred_at', dayEnd)
        .is('deleted_at', null).or(`is_private.eq.false,user_id.eq.${currentUserId}`)
        .order('occurred_at', { ascending: true }).limit(1).maybeSingle(),
    ]);

    const totalConvertedAmount = (totals.data ?? []).reduce(
      (acc: number, row: { converted_amount: number }) => acc + (row.converted_amount ?? 0),
      0,
    );

    // Inferred location = most-frequent expense place_name for the day.
    const placeCounts = new Map<string, number>();
    for (const row of (inferred.data ?? []) as Array<{ place_name: string }>) {
      placeCounts.set(row.place_name, (placeCounts.get(row.place_name) ?? 0) + 1);
    }
    let inferredLocation: string | null = null;
    let bestCount = 0;
    for (const [place, count] of placeCounts) {
      if (count > bestCount || (count === bestCount && (inferredLocation === null || place < inferredLocation))) {
        bestCount = count;
        inferredLocation = place;
      }
    }

    const overrideLocation = override.data?.location ?? null;
    const coverData = coverPath.data as
      | { journal_photos?: Array<{ storage_path: string }> }
      | null;
    const coverEntryFirstPhoto =
      coverData?.journal_photos?.[0]?.storage_path ?? null;

    const dayIndex =
      Math.floor((Date.parse(day) - Date.parse(trip.start_date)) / 86_400_000) + 1;

    summaries.push({
      dayDate: day,
      dayIndex: Math.max(1, dayIndex),
      photoCount: photoCount ?? 0,
      voiceCount: voiceCount ?? 0,
      expenseCount: expenseCount ?? 0,
      totalConvertedAmount,
      coverStoragePath: coverEntryFirstPhoto,
      effectiveLocation: overrideLocation ?? inferredLocation,
    });
  }

  return summaries;
}

const _check: JournalDaysQueries = {
  getDayMetadata,
  setLocation,
  setCoverPhotoEntry,
  listDaySummaries,
};
void _check;
