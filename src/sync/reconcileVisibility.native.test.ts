import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getActiveMemberships,
  getLocalExpenseIdsForTrip,
  getPendingCreateExpenseIds,
  softDeleteExpenseLocal,
} from '@/db/queries/localReconciliation';

import { reconcileVisibility } from './reconcileVisibility.native';

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
    getState: jest.fn(() => ({
      pushTripLoss: jest.fn(),
    })),
  },
}), { virtual: true });

jest.mock('./conflictResolver', () => ({
  applyRemote: jest.fn(),
}), { virtual: true });

describe('reconcileVisibility', () => {
  let mockDb: jest.Mocked<SQLiteDatabase>;
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {} as any;

    const mockSelect = jest.fn();
    // Setup Supabase chain
    mockSupabase = {
      from: jest.fn().mockImplementation((table) => {
        if (table === 'trip_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                not: jest.fn().mockResolvedValue({
                  data: [{ trip_id: 'trip-1' }],
                  error: null,
                }),
              }),
            }),
          };
        } else if (table === 'expenses') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                is: jest.fn().mockReturnValue({
                  range: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: mockSelect };
      }),
    } as unknown as SupabaseClient;

    (getActiveMemberships as jest.Mock).mockResolvedValue([
      { tripId: 'trip-1', tripName: 'Trip 1' },
    ]);
    (getPendingCreateExpenseIds as jest.Mock).mockResolvedValue(new Set());
  });

  it('continues gracefully if softDeleteExpenseLocal throws an error', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Local says we have 'id1' and 'id2', but server returned [] (meaning both were revoked)
    (getLocalExpenseIdsForTrip as jest.Mock).mockResolvedValue(['id1', 'id2']);

    // Make the first soft delete fail, and the second succeed
    (softDeleteExpenseLocal as jest.Mock)
      .mockRejectedValueOnce(new Error('Simulated failure'))
      .mockResolvedValueOnce([]); // empty photoUris array

    const result = await reconcileVisibility(mockDb, mockSupabase, 'user-1');

    // It should have revoked 1 item ('id2'), 'id1' failed.
    expect(result.revoked).toBe(1);
    expect(result.granted).toBe(0);

    // Ensure we tried to delete both
    expect(softDeleteExpenseLocal).toHaveBeenCalledTimes(2);
    expect(softDeleteExpenseLocal).toHaveBeenCalledWith(mockDb, 'id1');
    expect(softDeleteExpenseLocal).toHaveBeenCalledWith(mockDb, 'id2');

    // Ensure warning was logged for 'id1'
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'reconcile: softDeleteExpenseLocal failed for id1',
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });
});
