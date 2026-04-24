import { create } from 'zustand';

import type { SyncStatus } from '@/types/sync';

interface SyncStoreState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  setStatus: (status: SyncStatus) => void;
  setPendingCount: (count: number) => void;
  setSynced: (isoTimestamp: string) => void;
  setError: (message: string) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  status: 'synced',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,

  setStatus: (status) => set({ status }),

  setPendingCount: (count) =>
    set((state) => {
      if (count === state.pendingCount) return state;
      // Only downgrade an 'error' status when the queue fully drains.
      if (state.status === 'error' && count > 0) return { ...state, pendingCount: count };
      const status: SyncStatus =
        state.status === 'syncing' ? 'syncing' : count > 0 ? 'pending' : 'synced';
      return { pendingCount: count, status };
    }),

  setSynced: (isoTimestamp) =>
    set({
      status: get().pendingCount > 0 ? 'pending' : 'synced',
      lastSyncedAt: isoTimestamp,
      lastError: null,
    }),

  setError: (message) => set({ status: 'error', lastError: message }),

  reset: () =>
    set({ status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null }),
}));
