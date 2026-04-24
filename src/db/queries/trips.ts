import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type { Trip, TripMember, TripMemberRole, TripWithStats } from '@/types/trip';
import { newId } from '@/utils/id';

import { enqueueSync } from './syncQueue';

interface TripRow {
  id: string;
  name: string;
  emoji: string;
  start_date: string;
  end_date: string | null;
  base_currency: string;
  home_currency: string;
  budget: number | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface TripMemberRow {
  id: string;
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  invited_at: string;
  joined_at: string | null;
}

interface TripStatsRow {
  id: string;
  total_spent: number | null;
  member_count: number | null;
  budget_home: number | null;
}

export interface CreateTripInput {
  name: string;
  emoji: string;
  startDate: string;
  endDate: string | null;
  baseCurrency: string;
  homeCurrency: string;
  budget: number | null;
  ownerId: string;
}

export interface UpdateTripInput {
  id: string;
  name?: string;
  emoji?: string;
  startDate?: string;
  endDate?: string | null;
  baseCurrency?: string;
  homeCurrency?: string;
  budget?: number | null;
}

function rowToTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    startDate: row.start_date,
    endDate: row.end_date,
    baseCurrency: row.base_currency,
    homeCurrency: row.home_currency,
    budget: row.budget,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
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

function tripToPayload(trip: Trip): Record<string, unknown> {
  return {
    id: trip.id,
    name: trip.name,
    emoji: trip.emoji,
    start_date: trip.startDate,
    end_date: trip.endDate,
    base_currency: trip.baseCurrency,
    home_currency: trip.homeCurrency,
    budget: trip.budget,
    owner_id: trip.ownerId,
    created_at: trip.createdAt,
    updated_at: trip.updatedAt,
    deleted_at: trip.deletedAt,
  };
}

export async function listTrips(): Promise<Trip[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TripRow>(
    'SELECT * FROM trips WHERE deleted_at IS NULL ORDER BY updated_at DESC;',
  );
  return rows.map(rowToTrip);
}

export async function listTripsWithStats(): Promise<TripWithStats[]> {
  const db = await getDatabase();
  const trips = await db.getAllAsync<TripRow>(
    'SELECT * FROM trips WHERE deleted_at IS NULL ORDER BY updated_at DESC;',
  );
  if (trips.length === 0) return [];

  const statsRows = await db.getAllAsync<TripStatsRow>(
    `SELECT
       t.id,
       (SELECT COALESCE(SUM(e.converted_amount), 0)
          FROM expenses e
          WHERE e.trip_id = t.id
            AND e.deleted_at IS NULL) AS total_spent,
       (SELECT COUNT(*) FROM trip_members m WHERE m.trip_id = t.id) AS member_count,
       CASE
         WHEN t.budget IS NULL THEN NULL
         WHEN t.base_currency = t.home_currency THEN t.budget
         ELSE t.budget * COALESCE(
           (SELECT AVG(e.converted_amount * 1.0 / e.amount)
              FROM expenses e
              WHERE e.trip_id = t.id
                AND e.deleted_at IS NULL
                AND e.currency = t.base_currency
                AND e.amount != 0),
           1
         )
       END AS budget_home
     FROM trips t
     WHERE t.deleted_at IS NULL;`,
  );

  const statsById = new Map<
    string,
    { totalSpent: number; memberCount: number; budgetHome: number | null }
  >();
  for (const row of statsRows) {
    statsById.set(row.id, {
      totalSpent: row.total_spent ?? 0,
      memberCount: row.member_count ?? 0,
      budgetHome: row.budget_home,
    });
  }

  return trips.map((row) => {
    const base = rowToTrip(row);
    const stats = statsById.get(row.id) ?? {
      totalSpent: 0,
      memberCount: 0,
      budgetHome: null,
    };
    return { ...base, stats };
  });
}

export async function getTrip(id: string): Promise<Trip | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TripRow>(
    'SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL;',
    [id],
  );
  return row ? rowToTrip(row) : null;
}

export async function listTripMembers(tripId: string): Promise<TripMember[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TripMemberRow>(
    'SELECT * FROM trip_members WHERE trip_id = ?;',
    [tripId],
  );
  return rows.map(rowToMember);
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const trip: Trip = {
    id: newId(),
    name: input.name,
    emoji: input.emoji,
    startDate: input.startDate,
    endDate: input.endDate,
    baseCurrency: input.baseCurrency,
    homeCurrency: input.homeCurrency,
    budget: input.budget,
    ownerId: input.ownerId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const member: TripMember = {
    id: newId(),
    tripId: trip.id,
    userId: input.ownerId,
    role: 'owner',
    invitedAt: now,
    joinedAt: now,
  };

  await db.withTransactionAsync(async () => {
    await insertTrip(db, trip);
    await insertMember(db, member);
    await enqueueSync(db, 'trips', trip.id, 'create', tripToPayload(trip));
    await enqueueSync(db, 'trip_members', member.id, 'create', {
      id: member.id,
      trip_id: member.tripId,
      user_id: member.userId,
      role: member.role,
      invited_at: member.invitedAt,
      joined_at: member.joinedAt,
    });
  });

  return trip;
}

export async function updateTrip(input: UpdateTripInput): Promise<Trip> {
  const db = await getDatabase();
  const existing = await getTrip(input.id);
  if (!existing) throw new Error('Trip not found');

  const next: Trip = {
    ...existing,
    name: input.name ?? existing.name,
    emoji: input.emoji ?? existing.emoji,
    startDate: input.startDate ?? existing.startDate,
    endDate: input.endDate === undefined ? existing.endDate : input.endDate,
    baseCurrency: input.baseCurrency ?? existing.baseCurrency,
    homeCurrency: input.homeCurrency ?? existing.homeCurrency,
    budget: input.budget === undefined ? existing.budget : input.budget,
    updatedAt: new Date().toISOString(),
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE trips
         SET name = ?, emoji = ?, start_date = ?, end_date = ?,
             base_currency = ?, home_currency = ?, budget = ?, updated_at = ?
       WHERE id = ?;`,
      [
        next.name,
        next.emoji,
        next.startDate,
        next.endDate,
        next.baseCurrency,
        next.homeCurrency,
        next.budget,
        next.updatedAt,
        next.id,
      ],
    );
    await enqueueSync(db, 'trips', next.id, 'update', tripToPayload(next));
  });

  return next;
}

export async function softDeleteTrip(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE trips SET deleted_at = ?, updated_at = ? WHERE id = ?;',
      [now, now, id],
    );
    await enqueueSync(db, 'trips', id, 'delete', { id, deleted_at: now, updated_at: now });
  });
}

async function insertTrip(db: SQLiteDatabase, trip: Trip): Promise<void> {
  await db.runAsync(
    `INSERT INTO trips
       (id, name, emoji, start_date, end_date, base_currency, home_currency,
        budget, owner_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      trip.id,
      trip.name,
      trip.emoji,
      trip.startDate,
      trip.endDate,
      trip.baseCurrency,
      trip.homeCurrency,
      trip.budget,
      trip.ownerId,
      trip.createdAt,
      trip.updatedAt,
      trip.deletedAt,
    ],
  );
}

async function insertMember(db: SQLiteDatabase, member: TripMember): Promise<void> {
  await db.runAsync(
    `INSERT INTO trip_members (id, trip_id, user_id, role, invited_at, joined_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [member.id, member.tripId, member.userId, member.role, member.invitedAt, member.joinedAt],
  );
}
