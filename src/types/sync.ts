export type SyncAction = 'create' | 'update' | 'delete';

export type SyncTable =
  | 'profiles'
  | 'trips'
  | 'trip_members'
  | 'expenses'
  | 'expense_splits'
  | 'expense_photos'
  | 'categories'
  | 'settlement_payments';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

export type PullTable = SyncTable;

export interface SyncQueueEntry {
  id: number;
  tableName: SyncTable;
  recordId: string;
  action: SyncAction;
  payload: string;
  createdAt: string;
  syncedAt: string | null;
  error: string | null;
}

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}
