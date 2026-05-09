import { getDatabase } from '@/db/database';
import type {
  PendingInviteRow,
  Trip,
  TripMember,
  TripMemberRow,
} from '@/types/trip';
import { newId } from '@/utils/id';

import { enqueueSync } from './syncQueue';

export interface PendingInvite {
  member: TripMember;
  trip: Trip;
}

function rowToMember(row: TripMemberRow): TripMember {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    role: row.role,
    invitedAt: row.invited_at,
    joinedAt: row.joined_at,
    budget: row.budget,
    updatedAt: row.updated_at ?? row.invited_at,
  };
}

function memberToPayload(m: TripMember): Record<string, unknown> {
  return {
    id: m.id,
    trip_id: m.tripId,
    user_id: m.userId,
    role: m.role,
    invited_at: m.invitedAt,
    joined_at: m.joinedAt,
    budget: m.budget,
    updated_at: m.updatedAt,
  };
}

export async function getExistingMember(
  tripId: string,
  userId: string,
): Promise<TripMember | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TripMemberRow>(
    'SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ?;',
    [tripId, userId],
  );
  return row ? rowToMember(row) : null;
}

export async function inviteMember(
  tripId: string,
  userId: string,
): Promise<TripMember> {
  const db = await getDatabase();
  const existing = await getExistingMember(tripId, userId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const member: TripMember = {
    id: newId(),
    tripId,
    userId,
    role: 'member',
    invitedAt: now,
    joinedAt: null,
    budget: null,
    updatedAt: now,
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO trip_members
         (id, trip_id, user_id, role, invited_at, joined_at, budget, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        member.id,
        member.tripId,
        member.userId,
        member.role,
        member.invitedAt,
        member.joinedAt,
        member.budget,
        member.updatedAt,
      ],
    );
    await enqueueSync(db, 'trip_members', member.id, 'create', memberToPayload(member));
  });

  return member;
}

export async function acceptInvite(memberId: string): Promise<TripMember> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TripMemberRow>(
    'SELECT * FROM trip_members WHERE id = ?;',
    [memberId],
  );
  if (!row) throw new Error('Invite not found');

  const joinedAt = new Date().toISOString();
  const next: TripMember = { ...rowToMember(row), joinedAt, updatedAt: joinedAt };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE trip_members SET joined_at = ?, updated_at = ? WHERE id = ?;',
      [joinedAt, joinedAt, memberId],
    );
    await enqueueSync(db, 'trip_members', memberId, 'update', memberToPayload(next));
  });

  return next;
}

export async function removeMember(memberId: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM trip_members WHERE id = ?;', [memberId]);
    await enqueueSync(db, 'trip_members', memberId, 'delete', { id: memberId });
  });
}

export async function declineInvite(memberId: string): Promise<void> {
  return removeMember(memberId);
}

export async function leaveTrip(tripId: string, userId: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ?;',
    [tripId, userId],
  );
  if (!row) return;
  await removeMember(row.id);
}

// Pending invites for a specific user: membership rows where joined_at is NULL
// (the partner invited them but they haven't accepted yet). Joins trips so the
// UI can render the trip name/emoji without a second query.
export async function listPendingInvitesForUser(userId: string): Promise<PendingInvite[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PendingInviteRow>(
    `SELECT
       m.id, m.trip_id, m.user_id, m.role, m.invited_at, m.joined_at,
       m.budget, m.updated_at,
       t.name AS trip_name, t.emoji AS trip_emoji,
       t.start_date AS trip_start_date, t.end_date AS trip_end_date,
       t.base_currency AS trip_base_currency, t.home_currency AS trip_home_currency,
       t.owner_id AS trip_owner_id,
       t.created_at AS trip_created_at, t.updated_at AS trip_updated_at
     FROM trip_members m
     JOIN trips t ON t.id = m.trip_id
     WHERE m.user_id = ?
       AND m.joined_at IS NULL
       AND t.deleted_at IS NULL
     ORDER BY m.invited_at DESC;`,
    [userId],
  );

  return rows.map((row) => ({
    member: rowToMember(row),
    trip: {
      id: row.trip_id,
      name: row.trip_name,
      emoji: row.trip_emoji,
      startDate: row.trip_start_date,
      endDate: row.trip_end_date,
      baseCurrency: row.trip_base_currency,
      homeCurrency: row.trip_home_currency,
      // The invitee hasn't set their personal budget yet; null is the right
      // default. (The legacy trips.budget column is no longer surfaced.)
      budget: null,
      ownerId: row.trip_owner_id,
      createdAt: row.trip_created_at,
      updatedAt: row.trip_updated_at,
      deletedAt: null,
    },
  }));
}
