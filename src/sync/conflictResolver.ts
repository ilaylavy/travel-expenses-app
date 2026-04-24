import type { SQLiteDatabase } from 'expo-sqlite';

import type { PullTable } from '@/types/sync';

type Remote = Record<string, unknown>;

function asString(v: unknown): string | null {
  return v == null ? null : String(v);
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asBoolInt(v: unknown): number {
  if (v === true || v === 1 || v === '1' || v === 't' || v === 'true') return 1;
  return 0;
}

export function shouldApplyRemote(
  localUpdatedAt: string | null,
  remoteUpdatedAt: string | null,
): boolean {
  if (!localUpdatedAt) return true;
  if (!remoteUpdatedAt) return false;
  return remoteUpdatedAt > localUpdatedAt;
}

async function getLocalUpdatedAt(
  db: SQLiteDatabase,
  table: PullTable,
  id: string,
): Promise<string | null> {
  if (table === 'expense_photos') {
    const row = await db.getFirstAsync<{ created_at: string }>(
      'SELECT created_at FROM expense_photos WHERE id = ?;',
      [id],
    );
    return row?.created_at ?? null;
  }
  if (table === 'trip_members') {
    // No updated_at column — use invited_at as the LWW timestamp.
    const row = await db.getFirstAsync<{ invited_at: string }>(
      'SELECT invited_at FROM trip_members WHERE id = ?;',
      [id],
    );
    return row?.invited_at ?? null;
  }
  const row = await db.getFirstAsync<{ updated_at: string }>(
    `SELECT updated_at FROM ${table} WHERE id = ?;`,
    [id],
  );
  return row?.updated_at ?? null;
}

async function applyProfile(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO profiles
       (id, name, avatar_url, default_currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [
      asString(r.id),
      asString(r.name) ?? '',
      asString(r.avatar_url),
      asString(r.default_currency) ?? 'USD',
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
    ],
  );
}

async function applyTrip(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO trips
       (id, name, emoji, start_date, end_date, base_currency, home_currency,
        budget, owner_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      asString(r.id),
      asString(r.name) ?? '',
      asString(r.emoji) ?? '✈️',
      asString(r.start_date) ?? '',
      asString(r.end_date),
      asString(r.base_currency) ?? 'USD',
      asString(r.home_currency) ?? 'USD',
      asNumber(r.budget),
      asString(r.owner_id) ?? '',
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
    ],
  );
}

async function applyTripMember(db: SQLiteDatabase, r: Remote): Promise<void> {
  const tripId = asString(r.trip_id);
  const userId = asString(r.user_id);
  const remoteId = asString(r.id);
  if (!tripId || !userId || !remoteId) return;

  // If a local row exists for the same (trip_id, user_id) but with a different
  // id (e.g. the client-generated owner row that the remote trigger replaced
  // with its own uuid), drop it first so the UNIQUE constraint does not fail.
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ?;',
    [tripId, userId],
  );
  if (existing && existing.id !== remoteId) {
    await db.runAsync('DELETE FROM trip_members WHERE id = ?;', [existing.id]);
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO trip_members
       (id, trip_id, user_id, role, invited_at, joined_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [
      remoteId,
      tripId,
      userId,
      asString(r.role) ?? 'member',
      asString(r.invited_at) ?? new Date().toISOString(),
      asString(r.joined_at),
    ],
  );
}

async function applyCategory(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO categories
       (id, name, emoji, color, sort_order, trip_id, created_by,
        is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      asString(r.id),
      asString(r.name) ?? '',
      asString(r.emoji) ?? '📦',
      asString(r.color) ?? '#999',
      asNumber(r.sort_order) ?? 0,
      asString(r.trip_id),
      asString(r.created_by),
      asBoolInt(r.is_archived),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
    ],
  );
}

async function applyExpense(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO expenses
       (id, trip_id, user_id, amount, currency, converted_amount, exchange_rate,
        category_id, note, payment_method, latitude, longitude, place_name,
        expense_date, expense_time, is_refund, is_excluded_from_daily_metrics,
        is_private, spread_start_date, spread_end_date,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      asString(r.id),
      asString(r.trip_id),
      asString(r.user_id),
      asNumber(r.amount) ?? 0,
      asString(r.currency) ?? 'USD',
      asNumber(r.converted_amount) ?? 0,
      asNumber(r.exchange_rate) ?? 1,
      asString(r.category_id),
      asString(r.note),
      asString(r.payment_method),
      asNumber(r.latitude),
      asNumber(r.longitude),
      asString(r.place_name),
      asString(r.expense_date) ?? '',
      asString(r.expense_time) ?? '',
      asBoolInt(r.is_refund),
      asBoolInt(r.is_excluded_from_daily_metrics),
      asBoolInt(r.is_private),
      asString(r.spread_start_date),
      asString(r.spread_end_date),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
    ],
  );
}

async function applyExpensePhoto(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO expense_photos
       (id, expense_id, storage_path, local_uri, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [
      asString(r.id),
      asString(r.expense_id),
      asString(r.storage_path) ?? '',
      asString(r.local_uri),
      asNumber(r.sort_order) ?? 0,
      asString(r.created_at) ?? new Date().toISOString(),
    ],
  );
}

export async function applyRemote(
  db: SQLiteDatabase,
  table: PullTable,
  remote: Remote,
): Promise<boolean> {
  const id = asString(remote.id);
  if (!id) return false;

  const remoteUpdatedAt = asString(
    table === 'expense_photos'
      ? remote.created_at
      : table === 'trip_members'
        ? remote.invited_at
        : remote.updated_at,
  );
  const localUpdatedAt = await getLocalUpdatedAt(db, table, id);
  if (!shouldApplyRemote(localUpdatedAt, remoteUpdatedAt)) return false;

  switch (table) {
    case 'profiles':
      await applyProfile(db, remote);
      return true;
    case 'trips':
      await applyTrip(db, remote);
      return true;
    case 'trip_members':
      await applyTripMember(db, remote);
      return true;
    case 'categories':
      await applyCategory(db, remote);
      return true;
    case 'expenses':
      await applyExpense(db, remote);
      return true;
    case 'expense_photos':
      await applyExpensePhoto(db, remote);
      return true;
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function doRefreshStores(): Promise<void> {
  try {
    const { useTripStore } = await import('@/stores/tripStore');
    await useTripStore.getState().refresh();
  } catch (e) {
    console.warn('sync: failed to refresh tripStore', e);
  }
  try {
    const { useCategoryStore } = await import('@/stores/categoryStore');
    await useCategoryStore.getState().refresh();
  } catch (e) {
    console.warn('sync: failed to refresh categoryStore', e);
  }
  try {
    const { useExpenseStore } = await import('@/stores/expenseStore');
    const state = useExpenseStore.getState();
    if (state.activeTripId) await state.refresh();
  } catch (e) {
    console.warn('sync: failed to refresh expenseStore', e);
  }
}

export async function refreshStores(): Promise<void> {
  await doRefreshStores();
}

export function refreshStoresDebounced(delayMs = 150): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void doRefreshStores();
  }, delayMs);
}
