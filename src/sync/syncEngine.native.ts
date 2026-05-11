import NetInfo, { type NetInfoSubscription } from '@react-native-community/netinfo';
import { AppState, type NativeEventSubscription } from 'react-native';

import { getDatabase } from '@/db/database';
import { supabase } from '@/services/supabase';
import { useSyncStore } from '@/stores/syncStore';

import { ensureDefaultsReconciled, ensureExpensePayloadsRenamed } from './reconcileDefaults';
import { formatError } from './errorUtils';
import { pullChanges } from './pullChanges';
import { pushChanges } from './pushChanges';
import { subscribeToRealtime } from './realtimeSubscription';
import { getPendingCount } from './syncQueue';
import { setSyncTrigger } from './triggerDebounced';

let isRunning = false;
let pendingRerun = false;
let isStarted = false;
let netInfoUnsubscribe: NetInfoSubscription | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
let realtimeUnsubscribe: (() => void) | null = null;
let wasOnline = true;

async function refreshPendingCount(): Promise<void> {
  try {
    const db = await getDatabase();
    const count = await getPendingCount(db);
    useSyncStore.getState().setPendingCount(count);
  } catch (err) {
    console.warn('sync: failed to read pending count', err);
  }
}

export async function triggerSync(): Promise<void> {
  // Trigger model is mutation-driven: each enqueueSync schedules one of
  // these. If a sync is already in flight, mark a trailing rerun so a write
  // that lands mid-cycle still gets pushed — without the flag, in-flight
  // writes would sit in sync_queue until the next foreground / reconnect.
  if (isRunning) {
    pendingRerun = true;
    return;
  }
  isRunning = true;
  useSyncStore.getState().setStatus('syncing');
  try {
    const db = await getDatabase();
    // Reconcile client-seeded default categories against remote canonical
    // globals before pushing — avoids RLS-rejected pushes and FK violations
    // from expenses that used the old local uuids.
    await ensureDefaultsReconciled(db, supabase);
    // Rewrite any stale expense payloads still referencing the pre-rename
    // is_excluded_from_metrics column.
    await ensureExpensePayloadsRenamed(db);
    await pushChanges(db, supabase);
    await pullChanges(db, supabase);
    useSyncStore.getState().setSynced(new Date().toISOString());
  } catch (err) {
    const message = formatError(err);
    console.warn(`sync: cycle failed: ${message}`);
    useSyncStore.getState().setError(message);
  } finally {
    await refreshPendingCount();
    isRunning = false;
    if (pendingRerun) {
      pendingRerun = false;
      void triggerSync();
    }
  }
}

export async function start(): Promise<void> {
  if (isStarted) return;
  isStarted = true;

  await refreshPendingCount();

  realtimeUnsubscribe = subscribeToRealtime(supabase);

  // Reconnect: if internet returns, flush queued work and reconcile.
  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (online && !wasOnline) void triggerSync();
    wasOnline = online;
  });

  // Foreground: when the user brings the app back, run a sync so they see
  // anything that changed while they were away (including server-side
  // revocations that the realtime sub never delivered). This is the only
  // passive catch-up path now that the polling interval is gone.
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') void triggerSync();
  });

  // Wire the per-mutation debounced trigger. enqueueSync calls requestSync()
  // after every write; the registered callback fires triggerSync ~150ms
  // later, coalescing batched writes into a single cycle.
  setSyncTrigger(() => {
    void triggerSync();
  });

  // Kick off an immediate sync for queued work from a previous session.
  void triggerSync();
}

export function stop(): void {
  if (!isStarted) return;
  isStarted = false;

  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  if (realtimeUnsubscribe) {
    realtimeUnsubscribe();
    realtimeUnsubscribe = null;
  }
  setSyncTrigger(null);
  useSyncStore.getState().reset();
  isRunning = false;
  pendingRerun = false;
  wasOnline = true;
}

export const syncEngine = { start, stop, triggerSync };
