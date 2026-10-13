import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { useAuthStore } from '@/stores/authStore';
import type { PullTable } from '@/types/sync';

import { applyRemote, applyRemoteBulk, refreshStores } from './conflictResolver';
import { formatError } from './errorUtils';
import { reconcileVisibility } from './reconcileVisibility';
import { getLastPulledAt, setLastPulledAt } from './syncQueue';

const PULL_ORDER: PullTable[] = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'journal_moments',           // NEW — before any moment_id FK consumers
  'expenses',
  'expense_splits',
  'expense_photos',
  'settlement_payments',
  'journal_photo_entries',
  'journal_photos',
  'voice_clips',
  'journal_days',
];

const PAGE_SIZE = 500;
const EPOCH = '1970-01-01T00:00:00Z';

// expense_photos and journal_photos have no updated_at; cursor on created_at.
// Every other table (including trip_members since v5 — per-user budgets made
// it mutable) uses updated_at as the cursor.
function cursorColumn(table: PullTable): 'updated_at' | 'created_at' {
  if (table === 'expense_photos' || table === 'journal_photos') return 'created_at';
  return 'updated_at';
}

async function pullTable(
  db: SQLiteDatabase,
  supabase: SupabaseClient,
  table: PullTable,
): Promise<{ applied: number; memberUserIds: Set<string> }> {
  const cursor = cursorColumn(table);
  const since = (await getLastPulledAt(db, table)) ?? EPOCH;

  let applied = 0;
  let maxCursor = since;
  const memberUserIds = new Set<string>();

  let offset = 0;
  // Paginate in 500-row batches keyed by the cursor column, so first-sync on
  // a fresh install doesn't time out or OOM.
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt(cursor, since)
      .order(cursor, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    try {
      const changed = await applyRemoteBulk(db, table, rows as Record<string, unknown>[]);
      applied += changed;
    } catch (err) {
      const msg = formatError(err);
      if (!msg.toLowerCase().includes('constraint')) throw err;
      // In bulk mode, a constraint error fails the whole chunk.
      // Fallback to row-by-row insertion to isolate the failure and not lose valid rows.
      console.warn(`sync: bulk skipped orphans in ${table} due to constraint. Falling back to row-by-row.`, '—', msg);
      for (const row of rows as Record<string, unknown>[]) {
        try {
          const changed = await applyRemote(db, table, row);
          if (changed) applied += 1;
        } catch (rowErr) {
          const rowMsg = formatError(rowErr);
          if (!rowMsg.toLowerCase().includes('constraint')) throw rowErr;
          const refs: Record<string, unknown> = {};
          for (const k of Object.keys(row)) {
            if (k === 'id' || k.endsWith('_id')) refs[k] = row[k];
          }
          console.warn(`sync: skipped orphan ${table} row`, refs, '—', rowMsg);
        }
      }
    }

    for (const row of rows as Record<string, unknown>[]) {
      const rowCursor = row[cursor];
      if (typeof rowCursor === 'string' && rowCursor > maxCursor) maxCursor = rowCursor;

      if (table === 'trip_members') {
        const uid = row.user_id;
        if (typeof uid === 'string') memberUserIds.add(uid);
      }
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (maxCursor !== since) {
    await setLastPulledAt(db, table, maxCursor);
  }

  return { applied, memberUserIds };
}

async function backfillMissingProfiles(
  db: SQLiteDatabase,
  supabase: SupabaseClient,
  userIds: Set<string>,
): Promise<number> {
  if (userIds.size === 0) return 0;
  const ids = Array.from(userIds);
  const placeholders = ids.map(() => '?').join(',');
  const existing = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM profiles WHERE id IN (${placeholders});`,
    ids,
  );
  const known = new Set(existing.map((r) => r.id));
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length === 0) return 0;

  const { data, error } = await supabase.from('profiles').select('*').in('id', missing);
  if (error) {
    console.warn('sync: failed to backfill profiles', error.message);
    return 0;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return 0;

  try {
    return await applyRemoteBulk(db, 'profiles', rows);
  } catch (err) {
    console.warn('sync: failed to bulk apply backfill profiles, falling back to row-by-row', err);
    let backfillApplied = 0;
    for (const row of rows) {
      try {
        const changed = await applyRemote(db, 'profiles', row);
        if (changed) backfillApplied += 1;
      } catch (rowErr) {
        console.warn('sync: failed to apply backfill profile row', rowErr);
      }
    }
    return backfillApplied;
  }
}

export async function pullChanges(
  db: SQLiteDatabase,
  supabase: SupabaseClient,
): Promise<{ pulled: number }> {
  let total = 0;
  const allMemberUserIds = new Set<string>();

  for (const table of PULL_ORDER) {
    const result = await pullTable(db, supabase, table);
    total += result.applied;
    for (const uid of result.memberUserIds) allMemberUserIds.add(uid);
  }

  total += await backfillMissingProfiles(db, supabase, allMemberUserIds);

  // Visibility reconciliation closes the RLS-driven cursor blind spot:
  // rows that became invisible to this user (privacy flip, membership lost)
  // cannot ride a cursor pull or a realtime event, so we ask the server
  // directly what IDs are still visible and diff against local. See
  // reconcileVisibility.native.ts for the full reasoning.
  const userId = useAuthStore.getState().user?.id ?? null;
  if (userId) {
    try {
      const r = await reconcileVisibility(db, supabase, userId);
      total += r.revoked + r.granted + r.tripsLost;
    } catch (err) {
      console.warn('sync: reconcileVisibility failed', err);
    }
  }

  if (total > 0) await refreshStores();
  return { pulled: total };
}
