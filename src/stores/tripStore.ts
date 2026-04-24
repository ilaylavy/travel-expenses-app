import { create } from 'zustand';

import {
  createTrip as dbCreateTrip,
  listTripsWithStats,
  softDeleteTrip as dbSoftDeleteTrip,
  updateTrip as dbUpdateTrip,
  type CreateTripInput,
  type UpdateTripInput,
} from '@/db/queries/trips';
import type { TripWithStats } from '@/types/trip';

interface TripState {
  trips: TripWithStats[];
  activeTripId: string | null;
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  setActiveTrip: (tripId: string | null) => void;
  createTrip: (input: CreateTripInput) => Promise<TripWithStats>;
  updateTrip: (input: UpdateTripInput) => Promise<void>;
  deleteTrip: (tripId: string) => Promise<void>;
  reset: () => void;
}

function findTrip(trips: TripWithStats[], id: string): TripWithStats | undefined {
  return trips.find((t) => t.id === id);
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  activeTripId: null,
  isHydrated: false,
  isLoading: false,
  error: null,

  hydrate: async () => {
    if (get().isHydrated) return;
    set({ isLoading: true, error: null });
    try {
      const trips = await listTripsWithStats();
      set({ trips, isHydrated: true, isLoading: false });
    } catch (error) {
      console.warn('Failed to hydrate trip store:', error);
      set({ error: 'Could not load trips', isHydrated: true, isLoading: false });
    }
  },

  refresh: async () => {
    try {
      const trips = await listTripsWithStats();
      set({ trips, error: null });
    } catch (error) {
      console.warn('Failed to refresh trips:', error);
      set({ error: 'Could not load trips' });
    }
  },

  setActiveTrip: (tripId) => set({ activeTripId: tripId }),

  createTrip: async (input) => {
    const trip = await dbCreateTrip(input);
    const withStats: TripWithStats = { ...trip, stats: { totalSpent: 0, memberCount: 1 } };
    set((state) => ({ trips: [withStats, ...state.trips] }));
    return withStats;
  },

  updateTrip: async (input) => {
    const updated = await dbUpdateTrip(input);
    set((state) => ({
      trips: state.trips.map((t) => {
        if (t.id !== updated.id) return t;
        const stats = findTrip(state.trips, updated.id)?.stats ?? { totalSpent: 0, memberCount: 1 };
        return { ...updated, stats };
      }),
    }));
  },

  deleteTrip: async (tripId) => {
    await dbSoftDeleteTrip(tripId);
    set((state) => ({
      trips: state.trips.filter((t) => t.id !== tripId),
      activeTripId: state.activeTripId === tripId ? null : state.activeTripId,
    }));
  },

  reset: () => set({ trips: [], activeTripId: null, isHydrated: false, error: null }),
}));
