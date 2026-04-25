import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { deleteLocalPhoto } from '@/services/photoService';
import type { PullTable } from '@/types/sync';

import { applyRemote, refreshStoresDebounced } from './conflictResolver';

// `profiles` is intentionally absent: it is not in the supabase_realtime
// publication, and profile changes are infrequent enough to ride the regular
// pull cycle.
const TABLES: PullTable[] = [
  'trips',
  'trip_members',
  'categories',
  'expenses',
  'expense_photos',
];

const STUCK_ERROR_DELAY_MS = 10_000;

export function subscribeToRealtime(
  db: SQLiteDatabase,
  supabase: SupabaseClient,
): () => void {
  const channels: RealtimeChannel[] = [];
  const stuckTimers = new Map<PullTable, ReturnType<typeof setTimeout>>();
  let cancelled = false;

  // Push the user's JWT into the realtime client *before* subscribing.
  // supabase-js eventually does this when auth state propagates, but the
  // first subscribe attempt can race ahead and fail with CHANNEL_ERROR
  // because RLS-protected tables reject anon-keyed postgres_changes joins.
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);
    } catch (err) {
      console.warn('sync: realtime setAuth failed', err);
    }

    if (cancelled) return;

    for (const table of TABLES) {
      const channel = supabase
        .channel(`sync:${table}`)
        .on(
          'postgres_changes' as Parameters<RealtimeChannel['on']>[0],
          { event: '*', schema: 'public', table },
          (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
            void handleEvent(db, table, payload);
          },
        )
        .subscribe((status, err) => {
          const existing = stuckTimers.get(table);
          if (existing) {
            clearTimeout(existing);
            stuckTimers.delete(table);
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Cold-starts and brief reconnects often emit a transient error
            // before supabase-js retries successfully. Only surface a warning
            // if the channel stays errored long enough to matter.
            const detail = err instanceof Error ? `: ${err.message}` : '';
            const timer = setTimeout(() => {
              console.warn(
                `sync: realtime ${table} channel stuck in ${status}${detail}`,
              );
              stuckTimers.delete(table);
            }, STUCK_ERROR_DELAY_MS);
            stuckTimers.set(table, timer);
          }
        });
      channels.push(channel);
    }
  })();

  return () => {
    cancelled = true;
    for (const timer of stuckTimers.values()) clearTimeout(timer);
    stuckTimers.clear();
    for (const channel of channels) {
      void supabase.removeChannel(channel);
    }
  };
}

// Tables whose contract is hard-delete on the server. A realtime DELETE event
// on any other table (trips, expenses) is treated as noise: those tables use
// soft-delete (deleted_at), so a real DELETE would only come from out-of-band
// cleanup, and acting on it would cascade-wipe children locally without ever
// being able to recover them from a cursor-based pull.
const HARD_DELETE_TABLES: ReadonlySet<PullTable> = new Set([
  'trip_members',
  'categories',
  'expense_photos',
]);

async function handleEvent(
  db: SQLiteDatabase,
  table: PullTable,
  payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> },
): Promise<void> {
  try {
    if (payload.eventType === 'DELETE') {
      if (!HARD_DELETE_TABLES.has(table)) {
        console.warn(`sync: ignoring unexpected realtime DELETE on ${table}`);
        return;
      }
      // Realtime DELETE payloads only carry the primary key under REPLICA
      // IDENTITY DEFAULT — feeding that into applyRemote would clobber the
      // row with NULLs. For the tables above we just remove the local row.
      const rawId = payload.old?.id;
      if (rawId == null) return;
      const id = String(rawId);
      let localUriToCleanup: string | null = null;
      if (table === 'expense_photos') {
        const row = await db.getFirstAsync<{ local_uri: string | null }>(
          'SELECT local_uri FROM expense_photos WHERE id = ?;',
          [id],
        );
        localUriToCleanup = row?.local_uri ?? null;
      }
      await db.runAsync(`DELETE FROM ${table} WHERE id = ?;`, [id]);
      if (localUriToCleanup) await deleteLocalPhoto(localUriToCleanup);
      refreshStoresDebounced();
      return;
    }
    const row = payload.new;
    if (!row || !row.id) return;
    const applied = await applyRemote(db, table, row);
    if (applied) refreshStoresDebounced();
  } catch (err) {
    console.warn(`sync: realtime ${table} apply failed`, err);
  }
}
