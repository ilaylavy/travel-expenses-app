import type { SQLiteDatabase } from 'expo-sqlite';

import type { PullTable } from '@/types/sync';

import { asBoolInt, asNumber, asString } from './typeCoercion';

type Remote = Record<string, unknown>;

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
  if (table === 'expense_photos' || table === 'journal_photos') {
    const row = await db.getFirstAsync<{ created_at: string }>(
      `SELECT created_at FROM ${table} WHERE id = ?;`,
      [id],
    );
    return row?.created_at ?? null;
  }
  if (table === 'trip_members') {
    // updated_at was added in v5; old rows might still hold a NULL value if
    // the migration hasn't run yet, so fall back to invited_at.
    const row = await db.getFirstAsync<{ updated_at: string | null; invited_at: string }>(
      'SELECT updated_at, invited_at FROM trip_members WHERE id = ?;',
      [id],
    );
    return row?.updated_at ?? row?.invited_at ?? null;
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

// IMPORTANT: parent tables (trips, categories, expenses) must use UPSERT, not
// INSERT OR REPLACE. SQLite implements REPLACE as DELETE-then-INSERT of the
// conflicting row, which fires ON DELETE CASCADE on every child FK. For trips
// that means trip_members, categories, and expenses get wiped locally every
// time a trip's updated_at advances and pull re-applies the row. The cursor-
// based pull never re-fetches the now-missing children, so the trip
// permanently looks empty until a full resync.
async function applyTrip(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT INTO trips
       (id, name, emoji, start_date, end_date, base_currency, home_currency,
        budget, owner_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       emoji = excluded.emoji,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       base_currency = excluded.base_currency,
       home_currency = excluded.home_currency,
       budget = excluded.budget,
       owner_id = excluded.owner_id,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
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
       (id, trip_id, user_id, role, invited_at, joined_at, budget, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      remoteId,
      tripId,
      userId,
      asString(r.role) ?? 'member',
      asString(r.invited_at) ?? new Date().toISOString(),
      asString(r.joined_at),
      asNumber(r.budget),
      asString(r.updated_at) ?? asString(r.invited_at) ?? new Date().toISOString(),
    ],
  );
}

async function applyCategory(db: SQLiteDatabase, r: Remote): Promise<void> {
  // UPSERT (not REPLACE) — expenses.category_id references this row.
  await db.runAsync(
    `INSERT INTO categories
       (id, name, emoji, color, sort_order, trip_id, created_by,
        is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       emoji = excluded.emoji,
       color = excluded.color,
       sort_order = excluded.sort_order,
       trip_id = excluded.trip_id,
       created_by = excluded.created_by,
       is_archived = excluded.is_archived,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at;`,
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
  // UPSERT (not REPLACE) — expense_photos.expense_id and expense_splits.expense_id
  // cascade-delete when this row is REPLACE'd, wiping local children every time
  // the expense is re-pulled.
  await db.runAsync(
    `INSERT INTO expenses
       (id, trip_id, user_id, amount, currency, converted_amount, exchange_rate,
        category_id, note, payment_method, latitude, longitude, place_name,
        expense_date, expense_time, is_refund, is_excluded_from_daily_metrics,
        is_private, is_split, spread_start_date, spread_end_date,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       trip_id = excluded.trip_id,
       user_id = excluded.user_id,
       amount = excluded.amount,
       currency = excluded.currency,
       converted_amount = excluded.converted_amount,
       exchange_rate = excluded.exchange_rate,
       category_id = excluded.category_id,
       note = excluded.note,
       payment_method = excluded.payment_method,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       place_name = excluded.place_name,
       expense_date = excluded.expense_date,
       expense_time = excluded.expense_time,
       is_refund = excluded.is_refund,
       is_excluded_from_daily_metrics = excluded.is_excluded_from_daily_metrics,
       is_private = excluded.is_private,
       is_split = excluded.is_split,
       spread_start_date = excluded.spread_start_date,
       spread_end_date = excluded.spread_end_date,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
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
      asBoolInt(r.is_split),
      asString(r.spread_start_date),
      asString(r.spread_end_date),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
    ],
  );
}

async function applyExpenseSplit(db: SQLiteDatabase, r: Remote): Promise<void> {
  // UPSERT to keep the convention uniform with expenses, even though no child
  // FK currently points at expense_splits.
  await db.runAsync(
    `INSERT INTO expense_splits
       (id, expense_id, user_id, amount, is_payer,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       expense_id = excluded.expense_id,
       user_id = excluded.user_id,
       amount = excluded.amount,
       is_payer = excluded.is_payer,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
    [
      asString(r.id),
      asString(r.expense_id),
      asString(r.user_id),
      asNumber(r.amount) ?? 0,
      asBoolInt(r.is_payer),
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

async function applySettlementPayment(db: SQLiteDatabase, r: Remote): Promise<void> {
  // UPSERT — no child FKs currently reference settlement_payments, but using
  // UPSERT here keeps the convention uniform with other parent-style tables.
  await db.runAsync(
    `INSERT INTO settlement_payments
       (id, trip_id, from_user_id, to_user_id, amount, currency,
        exchange_rate, converted_amount, settled_date, note, expense_split_id,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       trip_id = excluded.trip_id,
       from_user_id = excluded.from_user_id,
       to_user_id = excluded.to_user_id,
       amount = excluded.amount,
       currency = excluded.currency,
       exchange_rate = excluded.exchange_rate,
       converted_amount = excluded.converted_amount,
       settled_date = excluded.settled_date,
       note = excluded.note,
       expense_split_id = excluded.expense_split_id,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
    [
      asString(r.id),
      asString(r.trip_id),
      asString(r.from_user_id),
      asString(r.to_user_id),
      asNumber(r.amount) ?? 0,
      asString(r.currency) ?? 'USD',
      asNumber(r.exchange_rate) ?? 1,
      asNumber(r.converted_amount) ?? 0,
      asString(r.settled_date) ?? '',
      asString(r.note),
      asString(r.expense_split_id),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
    ],
  );
}

async function applyJournalPhotoEntry(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT INTO journal_photo_entries
       (id, trip_id, user_id, occurred_at, caption, is_private,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       trip_id = excluded.trip_id,
       user_id = excluded.user_id,
       occurred_at = excluded.occurred_at,
       caption = excluded.caption,
       is_private = excluded.is_private,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
    [
      asString(r.id),
      asString(r.trip_id),
      asString(r.user_id),
      asString(r.occurred_at),
      asString(r.caption),
      asBoolInt(r.is_private),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
    ],
  );
}

async function applyJournalPhoto(db: SQLiteDatabase, r: Remote): Promise<void> {
  // No soft delete — file children cascade with parent entry. No updated_at
  // and no children of its own, so INSERT OR REPLACE is safe.
  await db.runAsync(
    `INSERT OR REPLACE INTO journal_photos
       (id, entry_id, storage_path, local_uri, sort_order, exif_taken_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [
      asString(r.id),
      asString(r.entry_id),
      asString(r.storage_path) ?? '',
      asString(r.local_uri),
      asNumber(r.sort_order) ?? 0,
      asString(r.exif_taken_at),
      asString(r.created_at) ?? new Date().toISOString(),
    ],
  );
}

async function applyVoiceClip(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT INTO voice_clips
       (id, trip_id, user_id, occurred_at, storage_path, local_uri, duration_sec,
        transcript, transcript_status, transcript_error, is_private,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       trip_id = excluded.trip_id,
       user_id = excluded.user_id,
       occurred_at = excluded.occurred_at,
       storage_path = excluded.storage_path,
       transcript = excluded.transcript,
       transcript_status = excluded.transcript_status,
       transcript_error = excluded.transcript_error,
       is_private = excluded.is_private,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
    [
      asString(r.id),
      asString(r.trip_id),
      asString(r.user_id),
      asString(r.occurred_at),
      asString(r.storage_path) ?? '',
      asString(r.local_uri),
      asNumber(r.duration_sec) ?? 1,
      asString(r.transcript),
      asString(r.transcript_status) ?? 'pending',
      asString(r.transcript_error),
      asBoolInt(r.is_private),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
    ],
  );
}

async function applyJournalDay(db: SQLiteDatabase, r: Remote): Promise<void> {
  await db.runAsync(
    `INSERT INTO journal_days
       (id, trip_id, day_date, location, cover_photo_entry_id,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       location = excluded.location,
       cover_photo_entry_id = excluded.cover_photo_entry_id,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at;`,
    [
      asString(r.id),
      asString(r.trip_id),
      asString(r.day_date),
      asString(r.location),
      asString(r.cover_photo_entry_id),
      asString(r.created_at) ?? new Date().toISOString(),
      asString(r.updated_at) ?? new Date().toISOString(),
      asString(r.deleted_at),
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
    table === 'expense_photos' || table === 'journal_photos'
      ? remote.created_at
      : table === 'trip_members'
        ? (remote.updated_at ?? remote.invited_at)
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
    case 'expense_splits':
      await applyExpenseSplit(db, remote);
      return true;
    case 'expense_photos':
      await applyExpensePhoto(db, remote);
      return true;
    case 'settlement_payments':
      await applySettlementPayment(db, remote);
      return true;
    case 'journal_photo_entries':
      await applyJournalPhotoEntry(db, remote);
      return true;
    case 'journal_photos':
      await applyJournalPhoto(db, remote);
      return true;
    case 'voice_clips':
      await applyVoiceClip(db, remote);
      return true;
    case 'journal_days':
      await applyJournalDay(db, remote);
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
  try {
    const { useSettlementStore } = await import('@/stores/settlementStore');
    const state = useSettlementStore.getState();
    if (state.activeTripId) await state.refresh();
  } catch (e) {
    console.warn('sync: failed to refresh settlementStore', e);
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
