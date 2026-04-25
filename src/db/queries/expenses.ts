import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import { deleteLocalPhoto } from '@/services/photoService';
import type {
  Expense,
  ExpensePhoto,
  ExpenseWithPhotos,
  PaymentMethod,
} from '@/types/expense';
import { newId } from '@/utils/id';

import { enqueueSync } from './syncQueue';

interface ExpenseRow {
  id: string;
  trip_id: string;
  user_id: string;
  amount: number;
  currency: string;
  converted_amount: number;
  exchange_rate: number;
  category_id: string;
  note: string | null;
  payment_method: string | null;
  latitude: number | null;
  longitude: number | null;
  place_name: string | null;
  expense_date: string;
  expense_time: string;
  is_refund: number;
  is_excluded_from_daily_metrics: number;
  is_private: number;
  spread_start_date: string | null;
  spread_end_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ExpensePhotoRow {
  id: string;
  expense_id: string;
  storage_path: string;
  local_uri: string | null;
  sort_order: number;
  created_at: string;
}

export interface CreateExpenseInput {
  tripId: string;
  userId: string;
  amount: number;
  currency: string;
  convertedAmount: number;
  exchangeRate: number;
  categoryId: string;
  note: string | null;
  paymentMethod: PaymentMethod | null;
  latitude: number | null;
  longitude: number | null;
  placeName: string | null;
  expenseDate: string;
  expenseTime: string;
  isRefund: boolean;
  isExcludedFromDailyMetrics: boolean;
  isPrivate: boolean;
  spreadStartDate: string | null;
  spreadEndDate: string | null;
  // id is optional; callers that persist files to disk before insertion
  // pre-generate it so the file path can embed it.
  photos?: Array<{ id?: string; localUri: string }>;
}

export interface UpdateExpenseInput {
  id: string;
  amount?: number;
  currency?: string;
  convertedAmount?: number;
  exchangeRate?: number;
  categoryId?: string;
  note?: string | null;
  paymentMethod?: PaymentMethod | null;
  latitude?: number | null;
  longitude?: number | null;
  placeName?: string | null;
  expenseDate?: string;
  expenseTime?: string;
  isRefund?: boolean;
  isExcludedFromDailyMetrics?: boolean;
  isPrivate?: boolean;
  spreadStartDate?: string | null;
  spreadEndDate?: string | null;
}

function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    amount: row.amount,
    currency: row.currency,
    convertedAmount: row.converted_amount,
    exchangeRate: row.exchange_rate,
    categoryId: row.category_id,
    note: row.note,
    paymentMethod: row.payment_method,
    latitude: row.latitude,
    longitude: row.longitude,
    placeName: row.place_name,
    expenseDate: row.expense_date,
    expenseTime: row.expense_time,
    isRefund: row.is_refund === 1,
    isExcludedFromDailyMetrics: row.is_excluded_from_daily_metrics === 1,
    isPrivate: row.is_private === 1,
    spreadStartDate: row.spread_start_date,
    spreadEndDate: row.spread_end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function rowToPhoto(row: ExpensePhotoRow): ExpensePhoto {
  return {
    id: row.id,
    expenseId: row.expense_id,
    storagePath: row.storage_path,
    localUri: row.local_uri,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function expenseToPayload(e: Expense): Record<string, unknown> {
  return {
    id: e.id,
    trip_id: e.tripId,
    user_id: e.userId,
    amount: e.amount,
    currency: e.currency,
    converted_amount: e.convertedAmount,
    exchange_rate: e.exchangeRate,
    category_id: e.categoryId,
    note: e.note,
    payment_method: e.paymentMethod,
    latitude: e.latitude,
    longitude: e.longitude,
    place_name: e.placeName,
    expense_date: e.expenseDate,
    expense_time: e.expenseTime,
    is_refund: e.isRefund,
    is_excluded_from_daily_metrics: e.isExcludedFromDailyMetrics,
    is_private: e.isPrivate,
    spread_start_date: e.spreadStartDate,
    spread_end_date: e.spreadEndDate,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
  };
}

function photoToPayload(p: ExpensePhoto): Record<string, unknown> {
  return {
    id: p.id,
    expense_id: p.expenseId,
    storage_path: p.storagePath,
    local_uri: p.localUri,
    sort_order: p.sortOrder,
    created_at: p.createdAt,
  };
}

export async function listExpensesForTrip(tripId: string): Promise<ExpenseWithPhotos[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpenseRow>(
    `SELECT * FROM expenses
       WHERE trip_id = ? AND deleted_at IS NULL
       ORDER BY expense_date DESC, expense_time DESC, created_at DESC;`,
    [tripId],
  );
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const photoRows = await db.getAllAsync<ExpensePhotoRow>(
    `SELECT * FROM expense_photos WHERE expense_id IN (${placeholders}) ORDER BY sort_order ASC;`,
    ids,
  );
  const byExpenseId = new Map<string, ExpensePhoto[]>();
  for (const p of photoRows) {
    const list = byExpenseId.get(p.expense_id) ?? [];
    list.push(rowToPhoto(p));
    byExpenseId.set(p.expense_id, list);
  }
  return rows.map((row) => ({
    ...rowToExpense(row),
    photos: byExpenseId.get(row.id) ?? [],
  }));
}

export async function getExpense(id: string): Promise<ExpenseWithPhotos | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ExpenseRow>(
    'SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL;',
    [id],
  );
  if (!row) return null;
  const photoRows = await db.getAllAsync<ExpensePhotoRow>(
    'SELECT * FROM expense_photos WHERE expense_id = ? ORDER BY sort_order ASC;',
    [id],
  );
  return { ...rowToExpense(row), photos: photoRows.map(rowToPhoto) };
}

export async function createExpense(input: CreateExpenseInput): Promise<ExpenseWithPhotos> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const expense: Expense = {
    id: newId(),
    tripId: input.tripId,
    userId: input.userId,
    amount: input.amount,
    currency: input.currency,
    convertedAmount: input.convertedAmount,
    exchangeRate: input.exchangeRate,
    categoryId: input.categoryId,
    note: input.note,
    paymentMethod: input.paymentMethod,
    latitude: input.latitude,
    longitude: input.longitude,
    placeName: input.placeName,
    expenseDate: input.expenseDate,
    expenseTime: input.expenseTime,
    isRefund: input.isRefund,
    isExcludedFromDailyMetrics: input.isExcludedFromDailyMetrics,
    isPrivate: input.isPrivate,
    spreadStartDate: input.spreadStartDate,
    spreadEndDate: input.spreadEndDate,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const photos: ExpensePhoto[] = (input.photos ?? []).map((p, index) => ({
    id: p.id ?? newId(),
    expenseId: expense.id,
    storagePath: '',
    localUri: p.localUri,
    sortOrder: index,
    createdAt: now,
  }));

  await db.withTransactionAsync(async () => {
    await insertExpense(db, expense);
    await enqueueSync(db, 'expenses', expense.id, 'create', expenseToPayload(expense));
    for (const photo of photos) {
      await insertPhoto(db, photo);
      await enqueueSync(db, 'expense_photos', photo.id, 'create', photoToPayload(photo));
    }
  });

  return { ...expense, photos };
}

export async function updateExpense(input: UpdateExpenseInput): Promise<Expense> {
  const db = await getDatabase();
  const existing = await getExpense(input.id);
  if (!existing) throw new Error('Expense not found');

  const next: Expense = {
    ...existing,
    amount: input.amount ?? existing.amount,
    currency: input.currency ?? existing.currency,
    convertedAmount: input.convertedAmount ?? existing.convertedAmount,
    exchangeRate: input.exchangeRate ?? existing.exchangeRate,
    categoryId: input.categoryId ?? existing.categoryId,
    note: input.note === undefined ? existing.note : input.note,
    paymentMethod:
      input.paymentMethod === undefined ? existing.paymentMethod : input.paymentMethod,
    latitude: input.latitude === undefined ? existing.latitude : input.latitude,
    longitude: input.longitude === undefined ? existing.longitude : input.longitude,
    placeName: input.placeName === undefined ? existing.placeName : input.placeName,
    expenseDate: input.expenseDate ?? existing.expenseDate,
    expenseTime: input.expenseTime ?? existing.expenseTime,
    isRefund: input.isRefund ?? existing.isRefund,
    isExcludedFromDailyMetrics: input.isExcludedFromDailyMetrics ?? existing.isExcludedFromDailyMetrics,
    isPrivate: input.isPrivate ?? existing.isPrivate,
    spreadStartDate:
      input.spreadStartDate === undefined ? existing.spreadStartDate : input.spreadStartDate,
    spreadEndDate:
      input.spreadEndDate === undefined ? existing.spreadEndDate : input.spreadEndDate,
    updatedAt: new Date().toISOString(),
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE expenses SET
         amount = ?, currency = ?, converted_amount = ?, exchange_rate = ?,
         category_id = ?, note = ?, payment_method = ?, latitude = ?,
         longitude = ?, place_name = ?, expense_date = ?, expense_time = ?,
         is_refund = ?, is_excluded_from_daily_metrics = ?, is_private = ?,
         spread_start_date = ?, spread_end_date = ?, updated_at = ?
       WHERE id = ?;`,
      [
        next.amount,
        next.currency,
        next.convertedAmount,
        next.exchangeRate,
        next.categoryId,
        next.note,
        next.paymentMethod,
        next.latitude,
        next.longitude,
        next.placeName,
        next.expenseDate,
        next.expenseTime,
        next.isRefund ? 1 : 0,
        next.isExcludedFromDailyMetrics ? 1 : 0,
        next.isPrivate ? 1 : 0,
        next.spreadStartDate,
        next.spreadEndDate,
        next.updatedAt,
        next.id,
      ],
    );
    await enqueueSync(db, 'expenses', next.id, 'update', expenseToPayload(next));
  });

  return next;
}

export async function softDeleteExpense(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  // Snapshot photos so we can clean up local files after commit and queue
  // Storage deletions for the sync engine to process.
  const photoRows = await db.getAllAsync<{
    id: string;
    local_uri: string | null;
    storage_path: string;
  }>(
    'SELECT id, local_uri, storage_path FROM expense_photos WHERE expense_id = ?;',
    [id],
  );
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?;',
      [now, now, id],
    );
    await enqueueSync(db, 'expenses', id, 'delete', {
      id,
      deleted_at: now,
      updated_at: now,
    });
    // Hard-delete photo rows locally and queue them for remote DB + Storage
    // cleanup. The expense row stays as a tombstone; the photos do not.
    for (const row of photoRows) {
      await db.runAsync('DELETE FROM expense_photos WHERE id = ?;', [row.id]);
      await enqueueSync(db, 'expense_photos', row.id, 'delete', {
        id: row.id,
        storage_path: row.storage_path,
      });
    }
  });
  await Promise.all(photoRows.map((row) => deleteLocalPhoto(row.local_uri)));
}

// Distinct note strings used most recently in this trip. Powers the
// tappable suggestion chips on the entry screen.
export async function listRecentNotesForTrip(
  tripId: string,
  limit = 8,
): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ note: string; last_used: string }>(
    `SELECT note, MAX(created_at) AS last_used
       FROM expenses
       WHERE trip_id = ? AND deleted_at IS NULL
         AND note IS NOT NULL AND TRIM(note) <> ''
       GROUP BY note
       ORDER BY last_used DESC
       LIMIT ?;`,
    [tripId, limit],
  );
  return rows.map((r) => r.note);
}

// Most recently used payment method — used to pre-select the selector.
export async function lastUsedPaymentMethodForTrip(
  tripId: string,
): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ payment_method: string | null }>(
    `SELECT payment_method FROM expenses
       WHERE trip_id = ? AND deleted_at IS NULL AND payment_method IS NOT NULL
       ORDER BY created_at DESC LIMIT 1;`,
    [tripId],
  );
  return row?.payment_method ?? null;
}

// Counts how often each category has been used in this trip, so the entry
// screen can show recently/frequently used categories first.
export async function categoryUsageForTrip(
  tripId: string,
): Promise<Map<string, { count: number; lastUsed: string }>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    category_id: string;
    uses: number;
    last_used: string;
  }>(
    `SELECT category_id, COUNT(*) AS uses, MAX(created_at) AS last_used
       FROM expenses
       WHERE trip_id = ? AND deleted_at IS NULL
       GROUP BY category_id;`,
    [tripId],
  );
  const map = new Map<string, { count: number; lastUsed: string }>();
  for (const row of rows) {
    map.set(row.category_id, { count: row.uses, lastUsed: row.last_used });
  }
  return map;
}

async function insertExpense(db: SQLiteDatabase, e: Expense): Promise<void> {
  await db.runAsync(
    `INSERT INTO expenses
       (id, trip_id, user_id, amount, currency, converted_amount, exchange_rate,
        category_id, note, payment_method, latitude, longitude, place_name,
        expense_date, expense_time, is_refund, is_excluded_from_daily_metrics,
        is_private, spread_start_date, spread_end_date,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      e.id,
      e.tripId,
      e.userId,
      e.amount,
      e.currency,
      e.convertedAmount,
      e.exchangeRate,
      e.categoryId,
      e.note,
      e.paymentMethod,
      e.latitude,
      e.longitude,
      e.placeName,
      e.expenseDate,
      e.expenseTime,
      e.isRefund ? 1 : 0,
      e.isExcludedFromDailyMetrics ? 1 : 0,
      e.isPrivate ? 1 : 0,
      e.spreadStartDate,
      e.spreadEndDate,
      e.createdAt,
      e.updatedAt,
      e.deletedAt,
    ],
  );
}

async function insertPhoto(db: SQLiteDatabase, p: ExpensePhoto): Promise<void> {
  await db.runAsync(
    `INSERT INTO expense_photos
       (id, expense_id, storage_path, local_uri, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [p.id, p.expenseId, p.storagePath, p.localUri, p.sortOrder, p.createdAt],
  );
}
