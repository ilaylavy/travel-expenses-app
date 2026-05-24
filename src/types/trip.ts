export type TripMemberRole = 'owner' | 'member';

export interface Trip {
  id: string;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string | null;
  baseCurrency: string;
  homeCurrency: string;
  // The current user's personal budget for this trip, in home_currency.
  // Sourced from trip_members.budget for the active user — null when they
  // haven't set one. NOT the legacy trips.budget column.
  budget: number | null;
  ownerId: string;
  // Supabase Storage path for the trip's cover photo, used on the All Days
  // hero. Null until the user selects one.
  coverPhotoStoragePath: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TripMember {
  id: string;
  tripId: string;
  userId: string;
  role: TripMemberRole;
  invitedAt: string;
  joinedAt: string | null;
  // Personal budget for this trip in home_currency. Null = not set.
  budget: number | null;
  updatedAt: string;
}

export interface TripWithMembers extends Trip {
  members: TripMember[];
}

export interface TripStats {
  totalSpent: number;
  memberCount: number;
  // Budget converted into homeCurrency. Null when the trip has no budget.
  budgetHome: number | null;
}

export interface TripWithStats extends Trip {
  stats: TripStats;
}

// Raw SQLite row shapes for the trips domain.

export interface TripRow {
  id: string;
  name: string;
  emoji: string;
  start_date: string;
  end_date: string | null;
  base_currency: string;
  home_currency: string;
  // Legacy column. The new contract puts each user's budget on their
  // trip_members row; this stays nullable so old payloads don't break the
  // schema, but new code never reads it.
  budget: number | null;
  owner_id: string;
  cover_photo_storage_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TripMemberRow {
  id: string;
  trip_id: string;
  user_id: string;
  role: TripMemberRole;
  invited_at: string;
  joined_at: string | null;
  budget: number | null;
  updated_at: string | null;
}

export interface TripStatsRow {
  id: string;
  total_spent: number | null;
  member_count: number | null;
  budget_home: number | null;
}

// Used by the pending-invites query: a trip_members row joined with the
// trip's columns prefixed `trip_*` so the caller can hydrate both sides.
export interface PendingInviteRow extends TripMemberRow {
  trip_name: string;
  trip_emoji: string;
  trip_start_date: string;
  trip_end_date: string | null;
  trip_base_currency: string;
  trip_home_currency: string;
  trip_owner_id: string;
  trip_created_at: string;
  trip_updated_at: string;
}

// =========================================================
// Query inputs/outputs — shared between native and web query variants.
// =========================================================

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

export interface PendingInvite {
  member: TripMember;
  trip: Trip;
}
