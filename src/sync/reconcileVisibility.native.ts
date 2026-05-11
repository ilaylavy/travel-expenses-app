import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getActiveMemberships,
  getLocalExpenseIdsForTrip,
  getPendingCreateExpenseIds,
  softDeleteExpenseLocal,
  wipeLostTripLocal,
} from '@/db/queries/localReconciliation';
import { deleteLocalPhoto } from '@/services/photoService';
import { useNotificationStore } from '@/stores/notificationStore';

import { applyRemote } from './conflictResolver';
import { diffExpenseIds, diffLostMemberships } from './reconcileVisibilityDiff';

// Server-authoritative visibility reconciliation.
//
// Why this exists: once an RLS predicate stops returning a row to a client
// (privacy flip, membership revoked, trip-level access lost), the cursor pull
// and realtime subscription both go silent on that row — neither protocol can
// represent "this row left your view." This pass closes the gap by asking the
// server, for each trip the user is a member of, what IDs they're currently
// allowed to see, and reconciling the local mirror against that authoritative
// set.
//
// Runs every time pullChanges runs (which, under the mutation-driven trigger
// model, means after every local create/update/delete plus on app foreground
// and reconnect). Cheap: 1 round-trip for memberships + 1 ID query per trip.
//
// Returns counts so pullChanges can include them in its `total` and refresh
// stores if anything changed.

export interface ReconcileResult {
  revoked: number;
  granted: number;
  tripsLost: number;
}

const SERVER_PAGE_SIZE = 1000;

export async function reconcileVisibility(
  db: SQLiteDatabase,
  supabase: SupabaseClient,
  userId: string,
): Promise<ReconcileResult> {
  const result: ReconcileResult = { revoked: 0, granted: 0, tripsLost: 0 };

  // 1. Authoritative membership set from the server.
  const { data: serverMembersRaw, error: membersError } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('user_id', userId)
    .not('joined_at', 'is', null);

  if (membersError) {
    console.warn('reconcile: failed to fetch server memberships', membersError.message);
    return result;
  }

  const serverTripIds = new Set<string>(
    (serverMembersRaw ?? [])
      .map((r) => (typeof r.trip_id === 'string' ? r.trip_id : null))
      .filter((id): id is string => id !== null),
  );

  // 2. Local membership set (post cursor-pull, so it includes any cold-join
  //    row that landed this cycle).
  const localMemberships = await getActiveMemberships(db, userId);
  const localTripIds = new Set(localMemberships.map((m) => m.tripId));

  // 3. Trip-loss: local has, server doesn't.
  const lostTrips = diffLostMemberships(localMemberships, serverTripIds);
  for (const lost of lostTrips) {
    useNotificationStore.getState().pushTripLoss(lost.tripId, lost.tripName);
    try {
      const photoUris = await wipeLostTripLocal(db, lost.tripId, userId);
      // FS cleanup runs after the transaction commits, fire-and-forget.
      // A failure here just leaves an orphan file in the cache directory —
      // recoverable, not a sync correctness issue.
      void Promise.all(photoUris.map((uri) => deleteLocalPhoto(uri))).catch((err) => {
        console.warn('reconcile: photo cleanup failed', err);
      });
      result.tripsLost += 1;
    } catch (err) {
      console.warn(`reconcile: wipeLostTripLocal failed for ${lost.tripId}`, err);
    }
  }

  // 4. Per-trip expense reconciliation. Only trips where the user is still a
  //    member on both sides — anything else is either being torn down (handled
  //    above) or being set up by the cursor pull (next cycle covers it).
  const intersection: string[] = [];
  for (const id of localTripIds) {
    if (serverTripIds.has(id)) intersection.push(id);
  }

  for (const tripId of intersection) {
    try {
      const perTrip = await reconcileExpensesForTrip(db, supabase, tripId);
      result.revoked += perTrip.revoked;
      result.granted += perTrip.granted;
    } catch (err) {
      console.warn(`reconcile: expenses failed for ${tripId}`, err);
    }
  }

  return result;
}

async function reconcileExpensesForTrip(
  db: SQLiteDatabase,
  supabase: SupabaseClient,
  tripId: string,
): Promise<{ revoked: number; granted: number }> {
  // Server-side authoritative ID set for this trip. RLS filters this to what
  // the user is currently allowed to see (non-private rows + their own).
  // Pagination guards against trips that grow past the default page size.
  const serverIds = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('expenses')
      .select('id')
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .range(offset, offset + SERVER_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      if (typeof r.id === 'string') serverIds.add(r.id);
    }
    if (rows.length < SERVER_PAGE_SIZE) break;
    offset += SERVER_PAGE_SIZE;
  }

  const localIds = await getLocalExpenseIdsForTrip(db, tripId);
  const pendingCreates = await getPendingCreateExpenseIds(db);
  const { revoked: revokedIds, granted: grantedIds } = diffExpenseIds(
    localIds,
    serverIds,
    pendingCreates,
  );

  let revoked = 0;
  for (const id of revokedIds) {
    try {
      const photoUris = await softDeleteExpenseLocal(db, id);
      void Promise.all(photoUris.map((uri) => deleteLocalPhoto(uri))).catch((err) => {
        console.warn('reconcile: photo cleanup failed', err);
      });
      revoked += 1;
    } catch (err) {
      console.warn(`reconcile: softDeleteExpenseLocal failed for ${id}`, err);
    }
  }

  let granted = 0;
  if (grantedIds.length > 0) {
    // Pull the missing rows in chunks. Supabase's `.in()` filter handles
    // arrays of up to a few thousand IDs; chunk anyway to be defensive about
    // URL length.
    const CHUNK = 200;
    for (let i = 0; i < grantedIds.length; i += CHUNK) {
      const chunk = grantedIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .in('id', chunk);
      if (error) {
        console.warn(`reconcile: fetch granted chunk failed for ${tripId}`, error.message);
        continue;
      }
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        const changed = await applyRemote(db, 'expenses', row);
        if (changed) granted += 1;
      }
    }
  }

  return { revoked, granted };
}
