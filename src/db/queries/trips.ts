import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type {
  Trip,
  TripMember,
  TripMemberRow,
  TripRow,
  TripWithStats,
} from '@/types/trip';
import { newId } from '@/utils/id';

import { enqueueSync } from './syncQueue';

export interface CreateTripInput {
  name: string;
  emoji: string;
  startDate: string;
  endDate: string | null;
  baseCurrency: string;
  homeCurrency: string;
  // The owner's personal budget for the trip, in home_currency. Stored
  // on the owner's trip_members row, not on the trips table.
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
}

function rowToTripBase(row: TripRow): Omit<Trip, 'budget'> {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    startDate: row.start_date,
    endDate: row.end_date,
    baseCurrency: row.base_currency,
    homeCurrency: row.home_currency,
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
    budget: row.budget,
    updatedAt: row.updated_at ?? row.invited_at,
  };
}

// Trip rows are pushed without a budget column — budget lives on the member
// row now. The legacy column stays NULL on every write so it never drifts.
function tripToPayload(trip: Omit<Trip, 'budget'> & { deletedAt: string | null }): Record<string, unknown> {
  return {
    id: trip.id,
    name: trip.name,
    emoji: trip.emoji,
    start_date: trip.startDate,
    end_date: trip.endDate,
    base_currency: trip.baseCurrency,
    home_currency: trip.homeCurrency,
    budget: null,
    owner_id: trip.ownerId,
    created_at: trip.createdAt,
    updated_at: trip.updatedAt,
    deleted_at: trip.deletedAt,
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

async function getMemberBudget(
  db: SQLiteDatabase,
  tripId: string,
  userId: string | null,
): Promise<number | null> {
  if (!userId) return null;
  const row = await db.getFirstAsync<{ budget: number | null }>(
    'SELECT budget FROM trip_members WHERE trip_id = ? AND user_id = ?;',
    [tripId, userId],
  );
  return row?.budget ?? null;
}

export async function listTrips(currentUserId?: string): Promise<Trip[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TripRow>(
    'SELECT * FROM trips WHERE deleted_at IS NULL ORDER BY updated_at DESC;',
  );
  if (rows.length === 0) return [];
  if (!currentUserId) {
    return rows.map((row) => ({ ...rowToTripBase(row), budget: null }));
  }
  const placeholders = rows.map(() => '?').join(',');
  const memberRows = await db.getAllAsync<{ trip_id: string; budget: number | null }>(
    `SELECT trip_id, budget FROM trip_members
       WHERE user_id = ? AND trip_id IN (${placeholders});`,
    [currentUserId, ...rows.map((r) => r.id)],
  );
  const budgetByTrip = new Map<string, number | null>();
  for (const r of memberRows) budgetByTrip.set(r.trip_id, r.budget);
  return rows.map((row) => ({
    ...rowToTripBase(row),
    budget: budgetByTrip.get(row.id) ?? null,
  }));
}

// Hide trips where the current user is still a pending invitee (joined_at IS
// NULL). They belong in the pending-invites section, not the trips list.
export async function listTripsWithStats(
  currentUserId?: string,
): Promise<TripWithStats[]> {
  const db = await getDatabase();
  const trips = currentUserId
    ? await db.getAllAsync<TripRow>(
        `SELECT t.* FROM trips t
           WHERE t.deleted_at IS NULL
             AND (
               t.owner_id = ?
               OR EXISTS (
                 SELECT 1 FROM trip_members m
                 WHERE m.trip_id = t.id
                   AND m.user_id = ?
                   AND m.joined_at IS NOT NULL
               )
             )
           ORDER BY t.updated_at DESC;`,
        [currentUserId, currentUserId],
      )
    : await db.getAllAsync<TripRow>(
        'SELECT * FROM trips WHERE deleted_at IS NULL ORDER BY updated_at DESC;',
      );
  if (trips.length === 0) return [];

  // Per-user stats: total_spent and budget come from the current user's
  // perspective so the trip card's budget bar (personal-budget-vs-personal-
  // spend) makes sense. memberCount is trip-wide. budget_home is the active
  // user's trip_members.budget, already in home_currency.
  const placeholders = trips.map(() => '?').join(',');
  const tripIds = trips.map((t) => t.id);
  const memberCountRows = await db.getAllAsync<{ id: string; member_count: number | null }>(
    `SELECT t.id,
            (SELECT COUNT(*) FROM trip_members m WHERE m.trip_id = t.id) AS member_count
       FROM trips t WHERE t.id IN (${placeholders});`,
    tripIds,
  );
  const memberCountById = new Map<string, number>();
  for (const r of memberCountRows) memberCountById.set(r.id, r.member_count ?? 0);

  // Personal totalSpent = (full amount for non-split expenses the user paid)
  // + (their share of split expenses they participate in). Refunds excluded;
  // private-by-others are filtered via the privacy disjunction on the parent.
  const personalTotalByTrip = new Map<string, number>();
  if (currentUserId && tripIds.length > 0) {
    const nonSplitRows = await db.getAllAsync<{ trip_id: string; total: number | null }>(
      `SELECT trip_id, COALESCE(SUM(converted_amount), 0) AS total
         FROM expenses
         WHERE trip_id IN (${placeholders})
           AND user_id = ?
           AND deleted_at IS NULL
           AND is_split = 0
           AND is_refund = 0
         GROUP BY trip_id;`,
      [...tripIds, currentUserId],
    );
    for (const r of nonSplitRows) {
      personalTotalByTrip.set(r.trip_id, r.total ?? 0);
    }
    const splitRows = await db.getAllAsync<{ trip_id: string; total: number | null }>(
      `SELECT e.trip_id,
              COALESCE(SUM(
                CASE WHEN e.amount = 0 THEN 0
                     ELSE (es.amount * 1.0 / e.amount) * e.converted_amount
                END
              ), 0) AS total
         FROM expense_splits es
         JOIN expenses e ON e.id = es.expense_id
         WHERE e.trip_id IN (${placeholders})
           AND es.user_id = ?
           AND es.deleted_at IS NULL
           AND e.deleted_at IS NULL
           AND e.is_split = 1
           AND e.is_refund = 0
           AND (e.is_private = 0 OR e.user_id = ?)
         GROUP BY e.trip_id;`,
      [...tripIds, currentUserId, currentUserId],
    );
    for (const r of splitRows) {
      personalTotalByTrip.set(
        r.trip_id,
        (personalTotalByTrip.get(r.trip_id) ?? 0) + (r.total ?? 0),
      );
    }
  }

  // Pull each user's personal budget for these trips so the per-user view
  // can populate Trip.budget and stats.budgetHome.
  const budgetByTrip = new Map<string, number | null>();
  if (currentUserId) {
    const memberRows = await db.getAllAsync<{ trip_id: string; budget: number | null }>(
      `SELECT trip_id, budget FROM trip_members
         WHERE user_id = ? AND trip_id IN (${placeholders});`,
      [currentUserId, ...tripIds],
    );
    for (const r of memberRows) budgetByTrip.set(r.trip_id, r.budget);
  }

  return trips.map((row) => {
    const budget = budgetByTrip.get(row.id) ?? null;
    const base: Trip = { ...rowToTripBase(row), budget };
    return {
      ...base,
      stats: {
        totalSpent: personalTotalByTrip.get(row.id) ?? 0,
        memberCount: memberCountById.get(row.id) ?? 0,
        budgetHome: budget,
      },
    };
  });
}

export async function getTrip(
  id: string,
  currentUserId?: string,
): Promise<Trip | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TripRow>(
    'SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL;',
    [id],
  );
  if (!row) return null;
  const budget = await getMemberBudget(db, id, currentUserId ?? null);
  return { ...rowToTripBase(row), budget };
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
  const tripBase: Omit<Trip, 'budget'> = {
    id: newId(),
    name: input.name,
    emoji: input.emoji,
    startDate: input.startDate,
    endDate: input.endDate,
    baseCurrency: input.baseCurrency,
    homeCurrency: input.homeCurrency,
    ownerId: input.ownerId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const member: TripMember = {
    id: newId(),
    tripId: tripBase.id,
    userId: input.ownerId,
    role: 'owner',
    invitedAt: now,
    joinedAt: now,
    budget: input.budget,
    updatedAt: now,
  };

  await db.withTransactionAsync(async () => {
    await insertTrip(db, tripBase);
    await insertMember(db, member);
    await enqueueSync(db, 'trips', tripBase.id, 'create', tripToPayload(tripBase));
    await enqueueSync(db, 'trip_members', member.id, 'create', memberToPayload(member));
  });

  return { ...tripBase, budget: input.budget };
}

export async function updateTrip(input: UpdateTripInput): Promise<Trip> {
  const db = await getDatabase();
  const existing = await getTrip(input.id);
  if (!existing) throw new Error('Trip not found');

  const next: Omit<Trip, 'budget'> = {
    ...existing,
    name: input.name ?? existing.name,
    emoji: input.emoji ?? existing.emoji,
    startDate: input.startDate ?? existing.startDate,
    endDate: input.endDate === undefined ? existing.endDate : input.endDate,
    baseCurrency: input.baseCurrency ?? existing.baseCurrency,
    homeCurrency: input.homeCurrency ?? existing.homeCurrency,
    updatedAt: new Date().toISOString(),
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE trips
         SET name = ?, emoji = ?, start_date = ?, end_date = ?,
             base_currency = ?, home_currency = ?, updated_at = ?
       WHERE id = ?;`,
      [
        next.name,
        next.emoji,
        next.startDate,
        next.endDate,
        next.baseCurrency,
        next.homeCurrency,
        next.updatedAt,
        next.id,
      ],
    );
    await enqueueSync(db, 'trips', next.id, 'update', tripToPayload(next));
  });

  return { ...next, budget: existing.budget };
}

// Update one user's personal budget for a trip. The caller must already be a
// member of the trip — usually the active user editing their own row.
export async function updateMemberBudget(
  tripId: string,
  userId: string,
  budget: number | null,
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<TripMemberRow>(
    'SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ?;',
    [tripId, userId],
  );
  if (!existing) throw new Error('Trip member not found');
  const now = new Date().toISOString();
  const next: TripMember = {
    ...rowToMember(existing),
    budget,
    updatedAt: now,
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE trip_members SET budget = ?, updated_at = ? WHERE id = ?;',
      [budget, now, existing.id],
    );
    await enqueueSync(db, 'trip_members', existing.id, 'update', memberToPayload(next));
  });
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

async function insertTrip(db: SQLiteDatabase, trip: Omit<Trip, 'budget'>): Promise<void> {
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
      // The trips.budget column is retired — every new row stores NULL so
      // older clients that still read it just see "no budget set" until
      // they upgrade and start reading trip_members.budget instead.
      null,
      trip.ownerId,
      trip.createdAt,
      trip.updatedAt,
      trip.deletedAt,
    ],
  );
}

async function insertMember(db: SQLiteDatabase, member: TripMember): Promise<void> {
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
}
