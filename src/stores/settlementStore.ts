import { create } from 'zustand';

import {
  createSettlement as dbCreateSettlement,
  deleteSettlement as dbDeleteSettlement,
  listSettlementsForTrip,
} from '@/db/queries/settlements';
import type { CreateSettlementInput, SettlementPayment } from '@/types/settlement';

interface SettlementState {
  activeTripId: string | null;
  settlements: SettlementPayment[];
  isLoading: boolean;
  error: string | null;
  loadForTrip: (tripId: string) => Promise<void>;
  refresh: () => Promise<void>;
  createSettlement: (input: CreateSettlementInput) => Promise<SettlementPayment>;
  deleteSettlement: (id: string) => Promise<void>;
  clear: () => void;
}

function sortSettlements(rows: SettlementPayment[]): SettlementPayment[] {
  // Newest first by settled_date, then created_at as tiebreaker.
  return [...rows].sort((a, b) => {
    if (a.settledDate !== b.settledDate) return a.settledDate < b.settledDate ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export const useSettlementStore = create<SettlementState>((set, get) => ({
  activeTripId: null,
  settlements: [],
  isLoading: false,
  error: null,

  loadForTrip: async (tripId) => {
    set({ activeTripId: tripId, isLoading: true, error: null });
    try {
      const settlements = await listSettlementsForTrip(tripId);
      if (get().activeTripId !== tripId) return;
      set({ settlements: sortSettlements(settlements), isLoading: false });
    } catch (error) {
      console.warn('Failed to load settlements:', error);
      set({ error: 'Could not load payments', isLoading: false });
    }
  },

  refresh: async () => {
    const tripId = get().activeTripId;
    if (!tripId) return;
    try {
      const settlements = await listSettlementsForTrip(tripId);
      set({ settlements: sortSettlements(settlements), error: null });
    } catch (error) {
      console.warn('Failed to refresh settlements:', error);
      set({ error: 'Could not load payments' });
    }
  },

  createSettlement: async (input) => {
    const row = await dbCreateSettlement(input);
    set((state) => {
      if (state.activeTripId !== input.tripId) return state;
      return { settlements: sortSettlements([row, ...state.settlements]) };
    });
    return row;
  },

  deleteSettlement: async (id) => {
    await dbDeleteSettlement(id);
    set((state) => ({
      settlements: state.settlements.filter((s) => s.id !== id),
    }));
  },

  clear: () =>
    set({ activeTripId: null, settlements: [], error: null, isLoading: false }),
}));
