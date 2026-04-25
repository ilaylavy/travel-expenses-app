import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { deleteLocalPhoto } from '@/services/photoService';
import type { PullTable } from '@/types/sync';

import { applyRemote, refreshStoresDebounced } from './conflictResolver';

const TABLES: PullTable[] = [
  'profiles',
  'trips',
  'trip_members',
  'categories',
  'expenses',
  'expense_photos',
];

export function subscribeToRealtime(
  db: SQLiteDatabase,
  supabase: SupabaseClient,
): () => void {
  const channels: RealtimeChannel[] = [];

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
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`sync: realtime ${table} channel ${status}`);
        }
      });
    channels.push(channel);
  }

  return () => {
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
