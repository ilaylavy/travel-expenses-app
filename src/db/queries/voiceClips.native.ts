import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import { newId } from '@/utils/id';
import type { VoiceClip, VoiceClipRow } from '@/types/voice';

import type { VoiceClipsQueries } from './contract';
import { enqueueSync } from './syncQueue';

function rowToClip(r: VoiceClipRow): VoiceClip {
  return {
    id: r.id,
    tripId: r.trip_id,
    userId: r.user_id,
    occurredAt: r.occurred_at,
    storagePath: r.storage_path,
    localUri: r.local_uri,
    durationSec: r.duration_sec,
    transcript: r.transcript,
    transcriptStatus: r.transcript_status,
    transcriptError: r.transcript_error,
    isPrivate: r.is_private === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

export function clipToPayload(c: VoiceClip): Record<string, unknown> {
  return {
    id: c.id,
    trip_id: c.tripId,
    user_id: c.userId,
    occurred_at: c.occurredAt,
    storage_path: c.storagePath,
    local_uri: c.localUri,
    duration_sec: c.durationSec,
    transcript: c.transcript,
    transcript_status: c.transcriptStatus,
    transcript_error: c.transcriptError,
    is_private: c.isPrivate ? 1 : 0,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
  };
}

export async function getClipById(
  db: SQLiteDatabase,
  id: string,
): Promise<VoiceClip | null> {
  const row = await db.getFirstAsync<VoiceClipRow>(
    'SELECT * FROM voice_clips WHERE id = ?;',
    [id],
  );
  return row ? rowToClip(row) : null;
}

export async function setClipStoragePath(
  db: SQLiteDatabase,
  id: string,
  storagePath: string,
): Promise<void> {
  await db.runAsync(
    'UPDATE voice_clips SET storage_path = ? WHERE id = ?;',
    [storagePath, id],
  );
}

export async function listClipsForDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<VoiceClip[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<VoiceClipRow>(
    `SELECT * FROM voice_clips
      WHERE trip_id = ?
        AND SUBSTR(occurred_at, 1, 10) = ?
        AND deleted_at IS NULL
        AND (is_private = 0 OR user_id = ?)
      ORDER BY occurred_at ASC;`,
    [tripId, dayDateISO, currentUserId],
  );
  return rows.map(rowToClip);
}

export async function createClip(input: {
  tripId: string;
  userId: string;
  occurredAt: string;
  localUri: string;
  durationSec: number;
  isPrivate: boolean;
}): Promise<VoiceClip> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const clip: VoiceClip = {
    id: newId(),
    tripId: input.tripId,
    userId: input.userId,
    occurredAt: input.occurredAt,
    storagePath: '',
    localUri: input.localUri,
    durationSec: input.durationSec,
    transcript: null,
    transcriptStatus: 'pending',
    transcriptError: null,
    isPrivate: input.isPrivate,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO voice_clips
         (id, trip_id, user_id, occurred_at, storage_path, local_uri,
          duration_sec, transcript, transcript_status, transcript_error,
          is_private, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, ?, ?, ?, NULL);`,
      [
        clip.id, clip.tripId, clip.userId, clip.occurredAt,
        clip.storagePath, clip.localUri, clip.durationSec,
        clip.isPrivate ? 1 : 0, clip.createdAt, clip.updatedAt,
      ],
    );
    await enqueueSync(db, 'voice_clips', clip.id, 'create', clipToPayload(clip));
  });
  return clip;
}

export async function updateClipTranscript(
  clipId: string,
  transcript: string | null,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE voice_clips SET transcript = ?, updated_at = ? WHERE id = ?;',
      [transcript, updatedAt, clipId],
    );
    await enqueueSync(db, 'voice_clips', clipId, 'update', {
      id: clipId,
      transcript,
      updated_at: updatedAt,
    });
  });
}

export async function updateClipOccurredAt(
  clipId: string,
  occurredAtISO: string,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE voice_clips SET occurred_at = ?, updated_at = ? WHERE id = ?;',
      [occurredAtISO, updatedAt, clipId],
    );
    await enqueueSync(db, 'voice_clips', clipId, 'update', {
      id: clipId,
      occurred_at: occurredAtISO,
      updated_at: updatedAt,
    });
  });
}

export async function updateClipPrivacy(
  clipId: string,
  isPrivate: boolean,
): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE voice_clips SET is_private = ?, updated_at = ? WHERE id = ?;',
      [isPrivate ? 1 : 0, updatedAt, clipId],
    );
    await enqueueSync(db, 'voice_clips', clipId, 'update', {
      id: clipId,
      is_private: isPrivate ? 1 : 0,
      updated_at: updatedAt,
    });
  });
}

export async function softDeleteClip(clipId: string): Promise<void> {
  const db = await getDatabase();
  const ts = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE voice_clips SET deleted_at = ?, updated_at = ? WHERE id = ?;',
      [ts, ts, clipId],
    );
    await enqueueSync(db, 'voice_clips', clipId, 'delete', {
      id: clipId,
      deleted_at: ts,
      updated_at: ts,
    });
  });
}

export async function countClipsForTripDay(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM voice_clips
      WHERE trip_id = ?
        AND SUBSTR(occurred_at, 1, 10) = ?
        AND deleted_at IS NULL
        AND (is_private = 0 OR user_id = ?);`,
    [tripId, dayDateISO, currentUserId],
  );
  return row?.c ?? 0;
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
