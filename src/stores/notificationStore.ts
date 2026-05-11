import { create } from 'zustand';

import { newId } from '@/utils/id';

// One-shot toast events surfaced from background work (sync reconciliation,
// etc.) where there's no obvious "current screen" to anchor an alert against.
// The root authenticated layout mounts a host component that subscribes to
// this store and renders the queued events.
//
// Keyed by tripId so repeated reconciliation cycles for the same lost trip
// don't stack duplicates (the second push is a no-op while the first is
// still on screen).

export interface TripLossEvent {
  id: string;
  tripId: string;
  tripName: string;
}

interface NotificationStoreState {
  tripLossEvents: TripLossEvent[];
  pushTripLoss: (tripId: string, tripName: string) => void;
  dismiss: (eventId: string) => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationStoreState>((set) => ({
  tripLossEvents: [],

  pushTripLoss: (tripId, tripName) =>
    set((state) => {
      // De-dupe by tripId — don't stack the same revocation multiple times if
      // pull cycles fire back-to-back before the user dismisses the first one.
      if (state.tripLossEvents.some((e) => e.tripId === tripId)) return state;
      return {
        tripLossEvents: [
          ...state.tripLossEvents,
          { id: newId(), tripId, tripName },
        ],
      };
    }),

  dismiss: (eventId) =>
    set((state) => ({
      tripLossEvents: state.tripLossEvents.filter((e) => e.id !== eventId),
    })),

  reset: () => set({ tripLossEvents: [] }),
}));
