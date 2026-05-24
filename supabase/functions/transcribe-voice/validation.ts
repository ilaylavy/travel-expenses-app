// Pure request-shape validation for transcribe-voice. Extracted so it can be
// exercised by deno test without booting Deno.serve.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TranscribeRequest {
  voice_clip_id: string;
}

export function parseRequestBody(raw: unknown): TranscribeRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const id = (raw as Record<string, unknown>).voice_clip_id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
  return { voice_clip_id: id };
}
