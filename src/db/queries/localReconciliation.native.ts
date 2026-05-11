// Local-only mutation primitives used by the visibility reconciliation pass.
//
// These do NOT enqueue into sync_queue. The reconciler reacts to server-side
// state that the client cannot push back (an RLS-driven revocation, a trip
// membership the owner hard-deleted, etc.). Enqueueing would either be a
// no-op (the row is already gone server-side) or actively wrong (pushing a
// "delete" the user never issued).
//
// Everything in this file is native-only — there is no cross-platform contract
// because web has no SQLite cache to reconcile.

import type { SQLiteDatabase } from 'expo-sqlite';

export interface ActiveMembership {
  tripId: string;
  tripName: string;
}

// Active memberships for `userId`: joined invites whose trip row is not
// soft-deleted locally. Used to seed the trip-loss diff (compare against the
// authoritative server list).
export async function getActiveMemberships(
  db: SQLiteDatabase,
  userId: string,
): Promise<ActiveMembership[]> {
  const rows = await db.getAllAsync<{ trip_id: string; trip_name: string }>(
    `SELECT m.trip_id AS trip_id, t.name AS trip_name
       FROM trip_members m
       JOIN trips t ON t.id = m.trip_id
       WHERE m.user_id = ?
         AND m.joined_at IS NOT NULL
         AND t.deleted_at IS NULL;`,
    [userId],
  );
  return rows.map((r) => ({ tripId: r.trip_id, tripName: r.trip_name }));
}

// IDs of locally-visible expenses for a trip. Mirrors the server-side filter
// (deleted_at IS NULL) so the diff is meaningful.
export async function getLocalExpenseIdsForTrip(
  db: SQLiteDatabase,
  tripId: string,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM expenses WHERE trip_id = ? AND deleted_at IS NULL;',
    [tripId],
  );
  return rows.map((r) => r.id);
}

// Local IDs that are still waiting to push as a create. We must NOT reconcile
// these away — the server hasn't seen them yet, so its "this trip's IDs" list
// legitimately omits them. Without this guard, a fresh local create would be
// soft-deleted by the next pull cycle that runs before push finishes.
export async function getPendingCreateExpenseIds(
  db: SQLiteDatabase,
): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ record_id: string }>(
    `SELECT record_id FROM sync_queue
       WHERE table_name = 'expenses' AND action = 'create' AND synced_at IS NULL;`,
  );
  return new Set(rows.map((r) => r.record_id));
}

// Soft-delete an expense locally without enqueueing. Also clears photos
// (hard-delete; they're not in HARD_DELETE_TABLES for sync purposes but
// locally they have no value once the parent is gone) and soft-deletes splits.
//
// Returns the local_uri values for any photo rows we removed so the caller can
// delete the cached files from disk.
export async function softDeleteExpenseLocal(
  db: SQLiteDatabase,
  expenseId: string,
): Promise<string[]> {
  const now = new Date().toISOString();
  const photoUris: string[] = [];
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL;',
      [now, now, expenseId],
    );
    await db.runAsync(
      'UPDATE expense_splits SET deleted_at = ?, updated_at = ? WHERE expense_id = ? AND deleted_at IS NULL;',
      [now, now, expenseId],
    );
    const photoRows = await db.getAllAsync<{ id: string; local_uri: string | null }>(
      'SELECT id, local_uri FROM expense_photos WHERE expense_id = ?;',
      [expenseId],
    );
    for (const row of photoRows) {
      if (row.local_uri) photoUris.push(row.local_uri);
    }
    await db.runAsync('DELETE FROM expense_photos WHERE expense_id = ?;', [expenseId]);
  });
  return photoUris;
}

// Soft-delete the trip row locally and wipe trip-scoped data. Used when the
// user has lost membership in the trip server-side and there is nothing left
// for them to interact with.
//
// - trips: soft-delete (deleted_at) so the row stays around for any UI that
//   peeks at history, but listTripsWithStats filters it out.
// - trip_members: hard-delete the local membership row (matches the server's
//   hard-delete semantics for this table).
// - expenses: soft-delete all (cheap and the row's deleted_at filter hides
//   them everywhere; no sync_queue entries because the server has already
//   stopped showing them to us).
// - expense_splits / expense_photos / categories: hard-delete locally —
//   they're unreachable once the parent is gone.
// - sync_queue: drop pending entries scoped to this trip. They can never
//   succeed (RLS will reject the push) and would keep failing forever.
//
// Returns the list of photo local_uris removed, so the caller can clean up
// disk files outside the transaction.
export async function wipeLostTripLocal(
  db: SQLiteDatabase,
  tripId: string,
  userId: string,
): Promise<string[]> {
  const now = new Date().toISOString();
  const photoUris: string[] = [];

  // Snapshot photo URIs before deletion. Must be inside the same transaction
  // so we don't race with a concurrent insert, but the FS cleanup happens
  // after commit.
  await db.withTransactionAsync(async () => {
    const photoRows = await db.getAllAsync<{ local_uri: string | null }>(
      `SELECT p.local_uri
         FROM expense_photos p
         JOIN expenses e ON e.id = p.expense_id
         WHERE e.trip_id = ?;`,
      [tripId],
    );
    for (const row of photoRows) {
      if (row.local_uri) photoUris.push(row.local_uri);
    }

    // Drop pending sync_queue entries for this trip. We can identify them
    // either by record_id (for trip itself, trip_members, expenses, categories,
    // settlement_payments) or by joining to their parents (for splits and
    // photos, which key off the parent expense's trip_id).
    await db.runAsync(
      `DELETE FROM sync_queue
         WHERE synced_at IS NULL
           AND (
             (table_name = 'trips' AND record_id = ?)
             OR (table_name = 'trip_members'
                 AND record_id IN (SELECT id FROM trip_members WHERE trip_id = ?))
             OR (table_name = 'categories'
                 AND record_id IN (SELECT id FROM categories WHERE trip_id = ?))
             OR (table_name = 'expenses'
                 AND record_id IN (SELECT id FROM expenses WHERE trip_id = ?))
             OR (table_name = 'expense_splits'
                 AND record_id IN (
                   SELECT s.id FROM expense_splits s
                     JOIN expenses e ON e.id = s.expense_id
                     WHERE e.trip_id = ?
                 ))
             OR (table_name = 'expense_photos'
                 AND record_id IN (
                   SELECT p.id FROM expense_photos p
                     JOIN expenses e ON e.id = p.expense_id
                     WHERE e.trip_id = ?
                 ))
             OR (table_name = 'settlement_payments'
                 AND record_id IN (
                   SELECT id FROM settlement_payments WHERE trip_id = ?
                 ))
           );`,
      [tripId, tripId, tripId, tripId, tripId, tripId, tripId],
    );

    // Hard-delete trip-scoped children. ON DELETE CASCADE on the schema would
    // cover splits and photos if we deleted the expenses, but we want to keep
    // expenses as soft-delete tombstones — so do it manually.
    await db.runAsync(
      `DELETE FROM expense_splits
         WHERE expense_id IN (SELECT id FROM expenses WHERE trip_id = ?);`,
      [tripId],
    );
    await db.runAsync(
      `DELETE FROM expense_photos
         WHERE expense_id IN (SELECT id FROM expenses WHERE trip_id = ?);`,
      [tripId],
    );

    // Hard-delete settlement_payments. Pair-level events with no children of
    // their own, and the user has lost access so there's nothing to keep.
    await db.runAsync(
      'DELETE FROM settlement_payments WHERE trip_id = ?;',
      [tripId],
    );

    // Soft-delete expenses (set deleted_at so listExpensesForTrip ignores them
    // but the row remains as a tombstone in case of any lingering UI ref).
    await db.runAsync(
      'UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE trip_id = ? AND deleted_at IS NULL;',
      [now, now, tripId],
    );

    // Hard-delete categories (the trip is gone; there's no surface to show
    // categories from).
    await db.runAsync('DELETE FROM categories WHERE trip_id = ?;', [tripId]);

    // Hard-delete the user's trip_members row — matches the server's hard-
    // delete contract for this table. (Don't touch other members' rows; they
    // may still exist server-side and a future re-invite needs them.)
    await db.runAsync(
      'DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?;',
      [tripId, userId],
    );

    // Soft-delete the trip itself.
    await db.runAsync(
      'UPDATE trips SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL;',
      [now, now, tripId],
    );
  });

  return photoUris;
}
