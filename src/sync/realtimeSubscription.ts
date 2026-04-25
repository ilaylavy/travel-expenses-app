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
      .subscribe((status) => {
        const existing = stuckTimers.get(table);
        if (existing) {
          clearTimeout(existing);
          stuckTimers.delete(table);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Cold-starts and brief reconnects often emit a transient error
          // before supabase-js retries successfully. Only surface a warning
          // if the channel stays errored long enough to matter.
          const timer = setTimeout(() => {
            console.warn(`sync: realtime ${table} channel stuck in ${status}`);
            stuckTimers.delete(table);
          }, STUCK_ERROR_DELAY_MS);
          stuckTimers.set(table, timer);
        }
      });
    channels.push(channel);
  }

  return () => {
    for (const timer of stuckTimers.values()) clearTimeout(timer);
    stuckTimers.clear();
    for (const channel of channels) {
      void supabase.removeChannel(channel);
    }
  };
}

async function handleEvent(
  db: SQLiteDatabase,
  table: PullTable,
  payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> },
): Promise<void> {
  try {
    if (payload.eventType === 'DELETE') {
      // Realtime DELETE payloads only carry the primary key under REPLICA
      // IDENTITY DEFAULT — feeding that into applyRemote would clobber the
      // row with NULLs. For the few tables that hard-delete (expense_photos,
      // trip_members, categories), just remove the local row directly.
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
