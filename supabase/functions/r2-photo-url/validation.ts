// Pure request-shape validation for the r2-photo-url Edge Function.
// Extracted so it can be exercised by deno test without booting Deno.serve.

export type Op = 'PUT' | 'GET' | 'DELETE';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// Object key convention: <tripId>/<expenseId>/<photoId>.jpg — three UUIDs.
export const PATH_RE = new RegExp(`^(${UUID})\\/(${UUID})\\/(${UUID})\\.jpg$`, 'i');

export interface ParsedPath {
  tripId: string;
  expenseId: string;
  photoId: string;
}

export function parsePath(path: string): ParsedPath | null {
  const m = path.match(PATH_RE);
  if (!m) return null;
  return { tripId: m[1], expenseId: m[2], photoId: m[3] };
}

export function parseOp(raw: unknown): Op | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.toUpperCase();
  if (upper === 'PUT' || upper === 'GET' || upper === 'DELETE') return upper;
  return null;
}
