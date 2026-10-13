import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { wipeLostTripLocal, getActiveMemberships } from '@/db/queries/localReconciliation';

jest.mock('@/db/queries/localReconciliation', () => ({
  getActiveMemberships: jest.fn(),
  getLocalExpenseIdsForTrip: jest.fn(),
  getPendingCreateExpenseIds: jest.fn(),
  softDeleteExpenseLocal: jest.fn(),
  wipeLostTripLocal: jest.fn(),
}), { virtual: true });

jest.mock('@/services/photoService', () => ({
  deleteLocalPhoto: jest.fn(),
}), { virtual: true });

jest.mock('@/stores/notificationStore', () => ({
  useNotificationStore: {
    getState: jest.fn().mockReturnValue({
      pushTripLoss: jest.fn(),
    }),
  },
}), { virtual: true });

jest.mock('./conflictResolver', () => ({
  applyRemote: jest.fn(),
}), { virtual: true });

jest.mock('./reconcileVisibilityDiff', () => ({
  diffExpenseIds: jest.fn().mockReturnValue({ revoked: [], granted: [] }),
  diffLostMemberships: jest.fn().mockReturnValue([{ tripId: 'trip-1', tripName: 'Test Trip' }]),
}));

import { reconcileVisibility } from './reconcileVisibility.native';

describe('reconcileVisibility', () => {
  let db: SQLiteDatabase;
  let supabase: SupabaseClient;

  beforeEach(() => {
    jest.clearAllMocks();

    db = {} as SQLiteDatabase;

    const mockSupabaseQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnValue({
        data: [], // server says no trips
        error: null,
      }),
    };

    supabase = {
      from: jest.fn().mockReturnValue(mockSupabaseQuery),
    } as unknown as SupabaseClient;
  });

  it('catches and logs error when wipeLostTripLocal throws, without crashing sync', async () => {
    (getActiveMemberships as jest.Mock).mockResolvedValue([{ tripId: 'trip-1', tripName: 'Test Trip' }]);

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const testError = new Error('Database locked');
    (wipeLostTripLocal as jest.Mock).mockRejectedValue(testError);

    const result = await reconcileVisibility(db, supabase, 'user-1');

    expect(wipeLostTripLocal).toHaveBeenCalledWith(db, 'trip-1', 'user-1');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'reconcile: wipeLostTripLocal failed for trip-1',
      testError,
    );

    // Ensure it finishes without throwing, and tripsLost reflects 0 successful wipes.
    expect(result).toEqual({ revoked: 0, granted: 0, tripsLost: 0 });

    consoleWarnSpy.mockRestore();
  });
});
