// Web build of the sync engine. There is no offline queue, no SQLite cache,
// no push/pull cycle — every read and write hits Supabase directly from the
// stores. The only sync-engine job left is keeping an eye on remote changes
// via the realtime subscription so the UI updates when another device (or
// another tab) modifies data the user is looking at.
//
// The exported shape (`syncEngine.start/stop/triggerSync`) matches the
// native variant so callers don't branch on platform.

import { supabase } from '@/services/supabase';
import { useSyncStore } from '@/stores/syncStore';

import { subscribeToRealtime } from './realtimeSubscription';

let isStarted = false;
let realtimeUnsubscribe: (() => void) | null = null;

export async function triggerSync(): Promise<void> {
  // No-op on web — there's nothing to flush.
}

export async function start(): Promise<void> {
  if (isStarted) return;
  isStarted = true;
  realtimeUnsubscribe = subscribeToRealtime(supabase);
  // The status starts at 'synced' in the store and stays there on web —
  // there's no pending queue or cycle to track. setSynced bumps lastSyncedAt
  // so the UI's "Last synced" line shows something sensible.
  useSyncStore.getState().setSynced(new Date().toISOString());
}

export function stop(): void {
  if (!isStarted) return;
  isStarted = false;
  if (realtimeUnsubscribe) {
    realtimeUnsubscribe();
    realtimeUnsubscribe = null;
  }
  useSyncStore.getState().reset();
}

export const syncEngine = { start, stop, triggerSync };
