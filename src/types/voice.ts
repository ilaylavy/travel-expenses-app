// Voice clip entity + row types. Transcription is handled server-side by
// the transcribe-voice Edge Function; the client only reads & edits the
// resulting transcript.

export type TranscriptStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface VoiceClipRow {
  id: string;
  trip_id: string;
  user_id: string;
  occurred_at: string;          // ISO-8601 with timezone
  storage_path: string;         // '' until uploaded
  local_uri: string | null;
  duration_sec: number;         // 1–300
  transcript: string | null;
  transcript_status: TranscriptStatus;
  transcript_error: string | null;
  is_private: number;           // 0 or 1
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  moment_id: string | null;
}

export interface VoiceClip {
  id: string;
  tripId: string;
  userId: string;
  occurredAt: string;
  storagePath: string;
  localUri: string | null;
  durationSec: number;
  transcript: string | null;
  transcriptStatus: TranscriptStatus;
  transcriptError: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  momentId: string | null;
}
