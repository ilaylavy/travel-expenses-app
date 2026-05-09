// Web build of the realtime subscription module. Mirrors the native channel
// topology (one channel per table) and the setAuth-before-subscribe race fix,
// but on each event it just refreshes the relevant Zustand store — no
// SQLite write, no applyRemote.
//
// The HARD_DELETE_TABLES distinction from native still applies: trip_members,
// categories, and expense_photos are hard-deleted on the server, so a DELETE
// event is meaningful. On the soft-delete tables (trips, expenses,
// expense_splits) a raw DELETE event would be out-of-band cleanup; we
// ignore it the same way native does, so the cursor-based pull stays
// authoritative even though we don't have a cursor on web.

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import type { PullTable } from '@/types/sync';

import { refreshStoresDebounced } from './conflictResolver';

const TABLES: PullTable[] = [
  'trips',
  'trip_members',
  'categories',
  'expenses',
  'expense_splits',
  'expense_photos',
];

const HARD_DELETE_TABLES: ReadonlySet<PullTable> = new Set([
  'trip_members',
  'categories',
  'expense_photos',
]);

const STUCK_ERROR_DELAY_MS = 10_000;

export function subscribeToRealtime(supabase: SupabaseClient): () => void {
  const channels: RealtimeChannel[] = [];
  const stuckTimers = new Map<PullTable, ReturnType<typeof setTimeout>>();
  let cancelled = false;

  // Push the user's JWT into the realtime client *before* subscribing.
  // supabase-js eventually does this when auth state propagates, but the
  // first subscribe attempt can race ahead and fail with CHANNEL_ERROR.
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
          (payload: { eventType: string }) => {
            if (payload.eventType === 'DELETE' && !HARD_DELETE_TABLES.has(table)) {
              // Ignore raw DELETE on soft-delete tables — the row's own
              // soft-delete update will arrive separately via UPDATE.
              return;
            }
            // Web has no local mutation step. Just nudge the stores to
            // re-fetch; they'll see the new state from Supabase.
            refreshStoresDebounced();
          },
        )
        .subscribe((status, err) => {
          const existing = stuckTimers.get(table);
          if (existing) {
            clearTimeout(existing);
            stuckTimers.delete(table);
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
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
