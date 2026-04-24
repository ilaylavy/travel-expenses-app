import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

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
    const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
    if (!row || !row.id) return;
    const applied = await applyRemote(db, table, row);
    if (applied) refreshStoresDebounced();
  } catch (err) {
    console.warn(`sync: realtime ${table} apply failed`, err);
  }
}
