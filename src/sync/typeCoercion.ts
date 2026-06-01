import type { SyncTable } from '@/types/sync';

// Coerces an unknown value into a string. Returns null when the input is
// null/undefined; otherwise stringifies. Used when reading remote (PostgREST)
// rows where every column may be `unknown`.
export function asString(v: unknown): string | null {
  return v == null ? null : String(v);
}

export function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// SQLite stores booleans as INTEGER 0/1. asBoolInt accepts the wide
// range of truthy representations Postgres returns ('t', 'true', '1', 1, true)
// and normalizes them down to 0 | 1.
export function asBoolInt(v: unknown): number {
  if (v === true || v === 1 || v === '1' || v === 't' || v === 'true') return 1;
  return 0;
}

// Per-table list of columns that are stored locally as INTEGER 0/1 but the
// Postgres schema declares as boolean. pushChanges normalizes these on the
// way out so the remote upsert receives a real bool.
export const BOOL_FIELDS_BY_TABLE: Record<SyncTable, readonly string[]> = {
  profiles: [],
  trips: [],
  trip_members: [],
  categories: ['is_archived'],
  expenses: ['is_refund', 'is_excluded_from_daily_metrics', 'is_private', 'is_split'],
  expense_splits: ['is_payer'],
  expense_photos: [],
  settlement_payments: [],
  journal_photo_entries: ['is_private'],
  journal_photos: [],
  voice_clips: ['is_private'],
  journal_days: [],
  journal_moments: [],
};
