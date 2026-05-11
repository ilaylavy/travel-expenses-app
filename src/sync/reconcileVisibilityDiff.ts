// Pure ID-diff helpers used by reconcileVisibility. Lives in a platform-
// neutral module (no .native suffix) so the unit tests can import them
// without dragging in expo-sqlite or other native-only modules through the
// reconciliation file's import graph.

export interface MembershipKey {
  tripId: string;
}

// Pure diff: which local expense IDs are revoked (gone from server), which
// server IDs are newly granted (not in local). Pending creates are filtered
// out of the revoked candidate set — the server legitimately doesn't know
// about them yet, and reconciling them away would soft-delete the user's own
// in-flight write between enqueue and push.
export function diffExpenseIds(
  localIds: readonly string[],
  serverIds: ReadonlySet<string>,
  pendingCreates: ReadonlySet<string>,
): { revoked: string[]; granted: string[] } {
  const revoked: string[] = [];
  const localSet = new Set<string>();
  for (const id of localIds) {
    localSet.add(id);
    if (!serverIds.has(id) && !pendingCreates.has(id)) revoked.push(id);
  }
  const granted: string[] = [];
  for (const id of serverIds) {
    if (!localSet.has(id)) granted.push(id);
  }
  return { revoked, granted };
}

// Pure diff: which local memberships are gone server-side (trip-loss). New
// memberships (server has, local doesn't) are not the concern of this diff —
// the cursor pull for trip_members already handles that path; we just want
// the loss signal here.
export function diffLostMemberships<M extends MembershipKey>(
  local: readonly M[],
  serverTripIds: ReadonlySet<string>,
): M[] {
  return local.filter((m) => !serverTripIds.has(m.tripId));
}
