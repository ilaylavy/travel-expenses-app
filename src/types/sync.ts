export type SyncAction = 'create' | 'update' | 'delete';

export type SyncTable =
  | 'trips'
  | 'trip_members'
  | 'expenses'
  | 'expense_photos'
  | 'categories';

export type SyncStatus = 'synced' | 'pending' | 'error';

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
