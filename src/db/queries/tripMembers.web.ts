// Web build of the trip_members query module. Reads/writes go directly to
// Supabase. The native variant maintains the local copy and queues a sync
// row; web just executes the same intent against Postgres.

import { supabase } from '@/services/supabase';
import type {
  PendingInvite,
  TripMember,
  TripMemberRole,
} from '@/types/trip';

import type { TripMembersQueries } from './contract';

export type { PendingInvite };

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

interface RemotePendingInviteRow extends RemoteTripMemberRow {
  trips: {
    id: string;
    name: string;
    emoji: string;
    start_date: string;
    end_date: string | null;
    base_currency: string;
    home_currency: string;
    owner_id: string;
    cover_photo_storage_path: string | null;
    created_at: string;
    updated_at: string;
  };
}

function asNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  return typeof v === 'number' ? v : Number(v);
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

export async function getExistingMember(
  tripId: string,
  userId: string,
): Promise<TripMember | null> {
  const { data, error } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToMember(data as RemoteTripMemberRow) : null;
}

export async function inviteMember(
  tripId: string,
  userId: string,
): Promise<TripMember> {
  // Idempotent: if the row already exists, return it instead of inserting a
  // duplicate (UNIQUE on (trip_id, user_id) would reject it anyway).
  const existing = await getExistingMember(tripId, userId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('trip_members')
    .insert({
      trip_id: tripId,
      user_id: userId,
      role: 'member',
      joined_at: null,
      budget: null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToMember(data as RemoteTripMemberRow);
}

export async function acceptInvite(memberId: string): Promise<TripMember> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('trip_members')
    .update({ joined_at: now })
    .eq('id', memberId)
    .select('*')
    .single();
  if (error) throw error;
  return rowToMember(data as RemoteTripMemberRow);
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('id', memberId);
  if (error) throw error;
}

export async function declineInvite(memberId: string): Promise<void> {
  return removeMember(memberId);
}

export async function leaveTrip(tripId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function listPendingInvitesForUser(
  userId: string,
): Promise<PendingInvite[]> {
  // PostgREST FK embed: pull trip_members rows joined with their trip.
  const { data, error } = await supabase
    .from('trip_members')
    .select('*, trips!inner(id, name, emoji, start_date, end_date, base_currency, home_currency, owner_id, cover_photo_storage_path, created_at, updated_at, deleted_at)')
    .eq('user_id', userId)
    .is('joined_at', null)
    .is('trips.deleted_at', null)
    .order('invited_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RemotePendingInviteRow[]).map((row) => ({
    member: rowToMember(row),
    trip: {
      id: row.trips.id,
      name: row.trips.name,
      emoji: row.trips.emoji,
      startDate: row.trips.start_date,
      endDate: row.trips.end_date,
      baseCurrency: row.trips.base_currency,
      homeCurrency: row.trips.home_currency,
      // Invitee hasn't picked a personal budget yet.
      budget: null,
      ownerId: row.trips.owner_id,
      coverPhotoStoragePath: row.trips.cover_photo_storage_path == null ? null : String(row.trips.cover_photo_storage_path),
      createdAt: row.trips.created_at,
      updatedAt: row.trips.updated_at,
      deletedAt: null,
    },
  }));
}

const _check: TripMembersQueries = {
  getExistingMember,
  inviteMember,
  acceptInvite,
  removeMember,
  declineInvite,
  leaveTrip,
  listPendingInvitesForUser,
};
void _check;
