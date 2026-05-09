// Web build of the trips query module. Reads/writes go directly to Supabase
// Postgres. The add_owner_to_trip_members trigger creates the owner's
// membership row server-side, so createTrip only inserts the trips row and
// then patches the owner's budget onto the trigger-created member row.

import { supabase } from '@/services/supabase';
import type {
  CreateTripInput,
  Trip,
  TripMember,
  TripMemberRole,
  TripWithStats,
  UpdateTripInput,
} from '@/types/trip';

import type { TripQueries } from './contract';

export type { CreateTripInput, UpdateTripInput };

interface RemoteTripRow {
  id: string;
  name: string;
  emoji: string;
  start_date: string;
  end_date: string | null;
  base_currency: string;
  home_currency: string;
  budget: number | string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface RemoteTripMemberRow {
  id: string;
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  invited_at: string;
  joined_at: string | null;
  budget: number | string | null;
  updated_at: string | null;
}

function asNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  return typeof v === 'number' ? v : Number(v);
}

function rowToTripBase(row: RemoteTripRow): Omit<Trip, 'budget'> {
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

function rowToMember(row: RemoteTripMemberRow): TripMember {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    role: row.role,
    invitedAt: row.invited_at,
    joinedAt: row.joined_at,
    budget: asNumber(row.budget),
    updatedAt: row.updated_at ?? row.invited_at,
  };
}

async function getMemberBudget(
  tripId: string,
  userId: string | null | undefined,
): Promise<number | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('trip_members')
    .select('budget')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return asNumber(data?.budget ?? null);
}

export async function listTrips(currentUserId?: string): Promise<Trip[]> {
  // RLS on trips already restricts to trips the caller owns or is a member
  // of, so a flat select is fine.
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RemoteTripRow[];
  if (rows.length === 0) return [];
  if (!currentUserId) {
    return rows.map((row) => ({ ...rowToTripBase(row), budget: null }));
  }
  const ids = rows.map((r) => r.id);
  const { data: members, error: memberError } = await supabase
    .from('trip_members')
    .select('trip_id, budget')
    .eq('user_id', currentUserId)
    .in('trip_id', ids);
  if (memberError) throw memberError;
  const budgetByTrip = new Map<string, number | null>();
  for (const m of (members ?? []) as { trip_id: string; budget: number | string | null }[]) {
    budgetByTrip.set(m.trip_id, asNumber(m.budget));
  }
  return rows.map((row) => ({
    ...rowToTripBase(row),
    budget: budgetByTrip.get(row.id) ?? null,
  }));
}

// Server-side equivalent of the native listTripsWithStats query. RLS means
// the visibility predicate (owner OR joined member) is mostly redundant,
// but the join on trip_members.joined_at is what keeps pending invitees
// out of this list — same as native.
export async function listTripsWithStats(
  currentUserId?: string,
): Promise<TripWithStats[]> {
  if (!currentUserId) {
    const trips = await listTrips();
    return trips.map((t) => ({
      ...t,
      stats: { totalSpent: 0, memberCount: 0, budgetHome: t.budget },
    }));
  }
  // 1. Trips visible to the user that they have either owned or actually joined.
  const ownerQ = supabase
    .from('trips')
    .select('*')
    .is('deleted_at', null)
    .eq('owner_id', currentUserId);
  const joinedQ = supabase
    .from('trips')
    .select('*, trip_members!inner(user_id, joined_at)')
    .is('deleted_at', null)
    .eq('trip_members.user_id', currentUserId)
    .not('trip_members.joined_at', 'is', null);
  const [ownerRes, joinedRes] = await Promise.all([ownerQ, joinedQ]);
  if (ownerRes.error) throw ownerRes.error;
  if (joinedRes.error) throw joinedRes.error;
  const tripsById = new Map<string, RemoteTripRow>();
  for (const row of (ownerRes.data ?? []) as RemoteTripRow[]) tripsById.set(row.id, row);
  for (const row of (joinedRes.data ?? []) as RemoteTripRow[]) tripsById.set(row.id, row);
  const trips = Array.from(tripsById.values()).sort((a, b) =>
    a.updated_at < b.updated_at ? 1 : -1,
  );
  if (trips.length === 0) return [];

  const tripIds = trips.map((t) => t.id);

  // 2. Member counts per trip.
  const { data: memberRows, error: memberError } = await supabase
    .from('trip_members')
    .select('trip_id')
    .in('trip_id', tripIds);
  if (memberError) throw memberError;
  const memberCountById = new Map<string, number>();
  for (const m of (memberRows ?? []) as { trip_id: string }[]) {
    memberCountById.set(m.trip_id, (memberCountById.get(m.trip_id) ?? 0) + 1);
  }

  // 3. Personal budgets for the current user across these trips.
  const { data: budgetRows, error: budgetError } = await supabase
    .from('trip_members')
    .select('trip_id, budget')
    .eq('user_id', currentUserId)
    .in('trip_id', tripIds);
  if (budgetError) throw budgetError;
  const budgetByTrip = new Map<string, number | null>();
  for (const r of (budgetRows ?? []) as { trip_id: string; budget: number | string | null }[]) {
    budgetByTrip.set(r.trip_id, asNumber(r.budget));
  }

  // 4. Personal totalSpent: non-split + split share. RLS on expenses already
  // applies the privacy filter, so we just sum here.
  const personalTotal = new Map<string, number>();
  const { data: nonSplitRows, error: nonSplitErr } = await supabase
    .from('expenses')
    .select('trip_id, converted_amount')
    .in('trip_id', tripIds)
    .eq('user_id', currentUserId)
    .is('deleted_at', null)
    .eq('is_split', false)
    .eq('is_refund', false);
  if (nonSplitErr) throw nonSplitErr;
  for (const r of (nonSplitRows ?? []) as { trip_id: string; converted_amount: number | string }[]) {
    const amount = asNumber(r.converted_amount) ?? 0;
    personalTotal.set(r.trip_id, (personalTotal.get(r.trip_id) ?? 0) + amount);
  }

  const { data: splitRows, error: splitErr } = await supabase
    .from('expense_splits')
    .select(
      'amount, expenses!inner(trip_id, amount, converted_amount, is_split, is_refund, deleted_at, user_id, is_private)',
    )
    .eq('user_id', currentUserId)
    .is('deleted_at', null);
  if (splitErr) throw splitErr;
  type SplitRow = {
    amount: number | string;
    expenses: {
      trip_id: string;
      amount: number | string;
      converted_amount: number | string;
      is_split: boolean;
      is_refund: boolean;
      deleted_at: string | null;
      user_id: string;
      is_private: boolean;
    };
  };
  for (const row of (splitRows ?? []) as unknown as SplitRow[]) {
    const e = row.expenses;
    if (!e) continue;
    if (!tripIds.includes(e.trip_id)) continue;
    if (e.deleted_at !== null) continue;
    if (!e.is_split) continue;
    if (e.is_refund) continue;
    if (e.is_private && e.user_id !== currentUserId) continue;
    const parentAmount = asNumber(e.amount) ?? 0;
    const parentConverted = asNumber(e.converted_amount) ?? 0;
    const myShare = asNumber(row.amount) ?? 0;
    const ratio = parentAmount === 0 ? 0 : (myShare * 1.0) / parentAmount;
    personalTotal.set(
      e.trip_id,
      (personalTotal.get(e.trip_id) ?? 0) + ratio * parentConverted,
    );
  }

  return trips.map((row) => {
    const budget = budgetByTrip.get(row.id) ?? null;
    const base: Trip = { ...rowToTripBase(row), budget };
    return {
      ...base,
      stats: {
        totalSpent: personalTotal.get(row.id) ?? 0,
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
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const budget = await getMemberBudget(id, currentUserId);
  return { ...rowToTripBase(data as RemoteTripRow), budget };
}

export async function listTripMembers(tripId: string): Promise<TripMember[]> {
  const { data, error } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', tripId);
  if (error) throw error;
  return ((data ?? []) as RemoteTripMemberRow[]).map(rowToMember);
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  // Insert the trip first; the add_owner_to_trip_members trigger (server-side)
  // creates the owner's membership row automatically. Then patch the budget
  // onto that row so the trigger-created default doesn't lose the user input.
  const { data, error } = await supabase
    .from('trips')
    .insert({
      name: input.name,
      emoji: input.emoji,
      start_date: input.startDate,
      end_date: input.endDate,
      base_currency: input.baseCurrency,
      home_currency: input.homeCurrency,
      // trips.budget is the legacy column; new code stores per-user budgets
      // on trip_members. NULL keeps the old column from drifting.
      budget: null,
      owner_id: input.ownerId,
    })
    .select('*')
    .single();
  if (error) throw error;
  const trip = rowToTripBase(data as RemoteTripRow);

  if (input.budget !== null) {
    const { error: budgetError } = await supabase
      .from('trip_members')
      .update({ budget: input.budget })
      .eq('trip_id', trip.id)
      .eq('user_id', input.ownerId);
    if (budgetError) throw budgetError;
  }

  return { ...trip, budget: input.budget };
}

export async function updateTrip(input: UpdateTripInput): Promise<Trip> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.emoji !== undefined) patch.emoji = input.emoji;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.baseCurrency !== undefined) patch.base_currency = input.baseCurrency;
  if (input.homeCurrency !== undefined) patch.home_currency = input.homeCurrency;

  const { data, error } = await supabase
    .from('trips')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw error;
  const base = rowToTripBase(data as RemoteTripRow);
  // updateTrip can't change budget — pass through the existing member budget.
  const { data: { user } } = await supabase.auth.getUser();
  const budget = await getMemberBudget(input.id, user?.id);
  return { ...base, budget };
}

export async function updateMemberBudget(
  tripId: string,
  userId: string,
  budget: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('trip_members')
    .update({ budget })
    .eq('trip_id', tripId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function softDeleteTrip(id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('trips')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw error;
}

const _check: TripQueries = {
  listTrips,
  listTripsWithStats,
  getTrip,
  listTripMembers,
  createTrip,
  updateTrip,
  updateMemberBudget,
  softDeleteTrip,
};
void _check;
