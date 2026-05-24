import { supabase } from '@/services/supabase';
import { newId } from '@/utils/id';
import type { TranscriptStatus, VoiceClip } from '@/types/voice';

import type { VoiceClipsQueries } from './contract';

function rowToClip(r: Record<string, unknown>): VoiceClip {
  return {
    id: String(r.id),
    tripId: String(r.trip_id),
    userId: String(r.user_id),
    occurredAt: String(r.occurred_at),
    storagePath: String(r.storage_path ?? ''),
    localUri: null,
    durationSec: Number(r.duration_sec ?? 0),
    transcript: r.transcript == null ? null : String(r.transcript),
    transcriptStatus: (r.transcript_status ?? 'pending') as TranscriptStatus,
    transcriptError: r.transcript_error == null ? null : String(r.transcript_error),
    isPrivate: Boolean(r.is_private),
    momentId: r.moment_id == null ? null : String(r.moment_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: r.deleted_at == null ? null : String(r.deleted_at),
  };
}

export async function listClipsForDay(
  tripId: string,
  dayDateISO: string,
): Promise<VoiceClip[]> {
  const start = `${dayDateISO}T00:00:00Z`;
  const end = `${dayDateISO}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('voice_clips')
    .select('*')
    .eq('trip_id', tripId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToClip);
}

export async function createClip(input: {
  tripId: string;
  userId: string;
  occurredAt: string;
  localUri: string;
  durationSec: number;
  isPrivate: boolean;
}): Promise<VoiceClip> {
  const id = newId();
  const { data, error } = await supabase
    .from('voice_clips')
    .insert({
      id,
      trip_id: input.tripId,
      user_id: input.userId,
      occurred_at: input.occurredAt,
      storage_path: '',
      duration_sec: input.durationSec,
      is_private: input.isPrivate,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToClip(data);
}

export async function updateClipTranscript(
  clipId: string,
  transcript: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('voice_clips')
    .update({ transcript })
    .eq('id', clipId);
  if (error) throw error;
}

export async function updateClipOccurredAt(
  clipId: string,
  occurredAtISO: string,
): Promise<void> {
  const { error } = await supabase
    .from('voice_clips')
    .update({ occurred_at: occurredAtISO })
    .eq('id', clipId);
  if (error) throw error;
}

export async function updateClipPrivacy(
  clipId: string,
  isPrivate: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('voice_clips')
    .update({ is_private: isPrivate })
    .eq('id', clipId);
  if (error) throw error;
}

export async function softDeleteClip(clipId: string): Promise<void> {
  const { error } = await supabase
    .from('voice_clips')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', clipId);
  if (error) throw error;
}

export async function countClipsForTripDay(
  tripId: string,
  dayDateISO: string,
): Promise<number> {
  const start = `${dayDateISO}T00:00:00Z`;
  const end = `${dayDateISO}T23:59:59.999Z`;
  const { count, error } = await supabase
    .from('voice_clips')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
}

const _check: VoiceClipsQueries = {
  listClipsForDay,
  createClip,
  updateClipTranscript,
  updateClipOccurredAt,
  updateClipPrivacy,
  softDeleteClip,
  countClipsForTripDay,
};
void _check;
