import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import { deleteLocalPhoto } from '@/services/photoService';
import type {
  CreateExpenseInput,
  Expense,
  ExpensePhoto,
  ExpensePhotoRow,
  ExpenseRow,
  ExpenseWithPhotos,
  UpdateExpenseInput,
} from '@/types/expense';
import { newId } from '@/utils/id';

import type { ExpenseQueries } from './contract';
import { SettlementAttributedError } from './errors';
import { insertPhoto, photoToPayload, rowToPhoto } from './expensePhotos';
import { enqueueSync } from './syncQueue';

// True when any non-deleted split of this expense has an active attributed
// settlement. Used to block edits/deletes that would silently invalidate
// previously-recorded settlement amounts.
async function hasActiveAttributedSettlementForExpense(
  db: SQLiteDatabase,
  expenseId: string,
): Promise<boolean> {
  const row = await db.getFirstAsync<{ found: number }>(
    `SELECT 1 AS found
       FROM settlement_payments sp
       JOIN expense_splits es ON es.id = sp.expense_split_id
       WHERE es.expense_id = ?
         AND sp.deleted_at IS NULL
         AND sp.expense_split_id IS NOT NULL
       LIMIT 1;`,
    [expenseId],
  );
  return row !== null;
}

// Inputs live in @/types/expense; re-exported here so existing consumers
// keep working through the @/db/queries/expenses path.
export type { CreateExpenseInput, UpdateExpenseInput };

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
    isSplit: row.is_split === 1,
    spreadStartDate: row.spread_start_date,
    spreadEndDate: row.spread_end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
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
    is_split: e.isSplit,
    spread_start_date: e.spreadStartDate,
    spread_end_date: e.spreadEndDate,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
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
    isSplit: input.isSplit ?? false,
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
  if (await hasActiveAttributedSettlementForExpense(db, input.id)) {
    throw new SettlementAttributedError();
  }

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
    isSplit: input.isSplit ?? existing.isSplit,
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
         is_split = ?, spread_start_date = ?, spread_end_date = ?, updated_at = ?
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
        next.isSplit ? 1 : 0,
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
  if (await hasActiveAttributedSettlementForExpense(db, id)) {
    throw new SettlementAttributedError();
  }
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

async function insertExpense(db: SQLiteDatabase, e: Expense): Promise<void> {
  await db.runAsync(
    `INSERT INTO expenses
       (id, trip_id, user_id, amount, currency, converted_amount, exchange_rate,
        category_id, note, payment_method, latitude, longitude, place_name,
        expense_date, expense_time, is_refund, is_excluded_from_daily_metrics,
        is_private, is_split, spread_start_date, spread_end_date,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
      e.isSplit ? 1 : 0,
      e.spreadStartDate,
      e.spreadEndDate,
      e.createdAt,
      e.updatedAt,
      e.deletedAt,
    ],
  );
}

const _check: ExpenseQueries = {
  listExpensesForTrip,
  getExpense,
  createExpense,
  updateExpense,
  softDeleteExpense,
};
void _check;
