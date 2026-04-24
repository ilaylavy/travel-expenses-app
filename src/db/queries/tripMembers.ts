import { getDatabase } from '@/db/database';
import type { Trip, TripMember } from '@/types/trip';
import { newId } from '@/utils/id';

import { enqueueSync } from './syncQueue';

interface TripMemberRow {
  id: string;
  trip_id: string;
  user_id: string;
  role: 'owner' | 'member';
  invited_at: string;
  joined_at: string | null;
}

interface PendingInviteRow extends TripMemberRow {
  trip_name: string;
  trip_emoji: string;
  trip_start_date: string;
  trip_end_date: string | null;
  trip_base_currency: string;
  trip_home_currency: string;
  trip_budget: number | null;
  trip_owner_id: string;
  trip_created_at: string;
  trip_updated_at: string;
}

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

  const member: TripMember = {
    id: newId(),
    tripId,
    userId,
    role: 'member',
    invitedAt: new Date().toISOString(),
    joinedAt: null,
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO trip_members (id, trip_id, user_id, role, invited_at, joined_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [member.id, member.tripId, member.userId, member.role, member.invitedAt, member.joinedAt],
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
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE trip_members SET joined_at = ? WHERE id = ?;',
      [joinedAt, memberId],
    );
    await enqueueSync(db, 'trip_members', memberId, 'update', {
      id: memberId,
      trip_id: row.trip_id,
      user_id: row.user_id,
      role: row.role,
      invited_at: row.invited_at,
      joined_at: joinedAt,
    });
  });

  return { ...rowToMember(row), joinedAt };
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
       t.name AS trip_name, t.emoji AS trip_emoji,
       t.start_date AS trip_start_date, t.end_date AS trip_end_date,
       t.base_currency AS trip_base_currency, t.home_currency AS trip_home_currency,
       t.budget AS trip_budget, t.owner_id AS trip_owner_id,
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
      budget: row.trip_budget,
      ownerId: row.trip_owner_id,
      createdAt: row.trip_created_at,
      updatedAt: row.trip_updated_at,
      deletedAt: null,
    },
  }));
}
