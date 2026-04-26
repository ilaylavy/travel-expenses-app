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
