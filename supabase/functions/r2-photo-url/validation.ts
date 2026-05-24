// Pure request-shape validation for the r2-media-url Edge Function.
// Extracted so it can be exercised by deno test without booting Deno.serve.

export type Op = 'PUT' | 'GET' | 'DELETE';
export type Kind = 'expense-photo' | 'journal-photo' | 'voice-clip';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Per-kind path regex. The first capture group is always tripId (so the
// trip-membership check stays uniform). The last capture is the object id —
// either a photo id or a voice-clip id, depending on kind.
const PATH_RE_BY_KIND: Record<Kind, RegExp> = {
  'expense-photo': new RegExp(`^(${UUID})\\/${UUID}\\/(${UUID})\\.jpg$`, 'i'),
  'journal-photo': new RegExp(`^(${UUID})\\/journal\\/(${UUID})\\.jpg$`, 'i'),
  'voice-clip': new RegExp(`^(${UUID})\\/(${UUID})\\.m4a$`, 'i'),
};

// Back-compat alias used by the legacy three-UUID JPG path of `r2-photo-url`.
export const PATH_RE = PATH_RE_BY_KIND['expense-photo'];

export interface ParsedPath {
  tripId: string;
  objectId: string;
}

export function parsePath(path: string, kind: Kind): ParsedPath | null {
  const m = path.match(PATH_RE_BY_KIND[kind]);
  if (!m) return null;
  return { tripId: m[1], objectId: m[2] };
}

export function parseOp(raw: unknown): Op | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.toUpperCase();
  if (upper === 'PUT' || upper === 'GET' || upper === 'DELETE') return upper;
  return null;
}

const KNOWN_KINDS: readonly Kind[] = ['expense-photo', 'journal-photo', 'voice-clip'];

export function parseKind(raw: unknown): Kind | null {
  if (typeof raw !== 'string') return null;
  return (KNOWN_KINDS as readonly string[]).includes(raw) ? (raw as Kind) : null;
}

export function bucketEnvForKind(kind: Kind): 'R2_BUCKET_IMAGE' | 'R2_BUCKET_AUDIO' {
  return kind === 'voice-clip' ? 'R2_BUCKET_AUDIO' : 'R2_BUCKET_IMAGE';
}

export function contentTypeForKind(kind: Kind): string {
  return kind === 'voice-clip' ? 'audio/mp4' : 'image/jpeg';
}
