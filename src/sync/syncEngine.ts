import NetInfo, { type NetInfoSubscription } from '@react-native-community/netinfo';

import { getDatabase } from '@/db/database';
import { supabase } from '@/services/supabase';
import { useSyncStore } from '@/stores/syncStore';

import { ensureDefaultsReconciled, ensureExpensePayloadsRenamed } from './reconcileDefaults';
import { formatError } from './errorUtils';
import { pullChanges } from './pullChanges';
import { pushChanges } from './pushChanges';
import { subscribeToRealtime } from './realtimeSubscription';
import { getPendingCount } from './syncQueue';

const INTERVAL_MS = 60_000;

let isRunning = false;
let isStarted = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let netInfoUnsubscribe: NetInfoSubscription | null = null;
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
  if (isRunning) return;
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
  }
}

export async function start(): Promise<void> {
  if (isStarted) return;
  isStarted = true;

  await refreshPendingCount();

  const db = await getDatabase();
  realtimeUnsubscribe = subscribeToRealtime(db, supabase);

  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (online && !wasOnline) void triggerSync();
    wasOnline = online;
  });

  intervalHandle = setInterval(() => {
    void triggerSync();
  }, INTERVAL_MS);

  // Kick off an immediate sync for queued work from a previous session.
  void triggerSync();
}

export function stop(): void {
  if (!isStarted) return;
  isStarted = false;

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  if (realtimeUnsubscribe) {
    realtimeUnsubscribe();
    realtimeUnsubscribe = null;
  }
  useSyncStore.getState().reset();
  isRunning = false;
  wasOnline = true;
}

export const syncEngine = { start, stop, triggerSync };
