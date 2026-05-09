import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type { ExpenseSplit, ExpenseSplitRow } from '@/types/expense';
import { newId } from '@/utils/id';

import { enqueueSync } from './syncQueue';

export interface CreateSplitInput {
  userId: string;
  amount: number;
  isPayer: boolean;
}

function rowToSplit(row: ExpenseSplitRow): ExpenseSplit {
  return {
    id: row.id,
    expenseId: row.expense_id,
    userId: row.user_id,
    amount: row.amount,
    isPayer: row.is_payer === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function splitToPayload(s: ExpenseSplit): Record<string, unknown> {
  return {
    id: s.id,
    expense_id: s.expenseId,
    user_id: s.userId,
    amount: s.amount,
    is_payer: s.isPayer,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    deleted_at: s.deletedAt,
  };
}

export async function getSplitsForExpense(
  expenseId: string,
): Promise<ExpenseSplit[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpenseSplitRow>(
    `SELECT * FROM expense_splits
       WHERE expense_id = ? AND deleted_at IS NULL
       ORDER BY is_payer DESC, amount DESC, created_at ASC;`,
    [expenseId],
  );
  return rows.map(rowToSplit);
}

export async function getSplitsForTrip(tripId: string): Promise<ExpenseSplit[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpenseSplitRow>(
    `SELECT s.* FROM expense_splits s
       INNER JOIN expenses e ON e.id = s.expense_id
       WHERE e.trip_id = ?
         AND e.deleted_at IS NULL
         AND s.deleted_at IS NULL;`,
    [tripId],
  );
  return rows.map(rowToSplit);
}

async function insertSplit(db: SQLiteDatabase, s: ExpenseSplit): Promise<void> {
  await db.runAsync(
    `INSERT INTO expense_splits
       (id, expense_id, user_id, amount, is_payer, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      s.id,
      s.expenseId,
      s.userId,
      s.amount,
      s.isPayer ? 1 : 0,
      s.createdAt,
      s.updatedAt,
      s.deletedAt,
    ],
  );
}

export async function createSplits(
  expenseId: string,
  splits: CreateSplitInput[],
): Promise<ExpenseSplit[]> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const rows: ExpenseSplit[] = splits.map((s) => ({
    id: newId(),
    expenseId,
    userId: s.userId,
    amount: s.amount,
    isPayer: s.isPayer,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await insertSplit(db, row);
      await enqueueSync(db, 'expense_splits', row.id, 'create', splitToPayload(row));
    }
    await db.runAsync(
      'UPDATE expenses SET is_split = 1, updated_at = ? WHERE id = ?;',
      [now, expenseId],
    );
    const expensePayload = await readExpensePayload(db, expenseId);
    if (expensePayload) {
      await enqueueSync(db, 'expenses', expenseId, 'update', expensePayload);
    }
  });

  return rows;
}

export async function updateSplits(
  expenseId: string,
  splits: CreateSplitInput[],
): Promise<ExpenseSplit[]> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const newRows: ExpenseSplit[] = splits.map((s) => ({
    id: newId(),
    expenseId,
    userId: s.userId,
    amount: s.amount,
    isPayer: s.isPayer,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));

  await db.withTransactionAsync(async () => {
    // Soft-delete every existing non-deleted row for this expense.
    const existing = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM expense_splits WHERE expense_id = ? AND deleted_at IS NULL;',
      [expenseId],
    );
    for (const row of existing) {
      await db.runAsync(
        'UPDATE expense_splits SET deleted_at = ?, updated_at = ? WHERE id = ?;',
        [now, now, row.id],
      );
      await enqueueSync(db, 'expense_splits', row.id, 'delete', {
        id: row.id,
        deleted_at: now,
        updated_at: now,
      });
    }
    // Insert new rows.
    for (const row of newRows) {
      await insertSplit(db, row);
      await enqueueSync(db, 'expense_splits', row.id, 'create', splitToPayload(row));
    }
    // Ensure the parent flag stays correct (in case we are re-enabling).
    await db.runAsync(
      'UPDATE expenses SET is_split = 1, updated_at = ? WHERE id = ?;',
      [now, expenseId],
    );
    const expensePayload = await readExpensePayload(db, expenseId);
    if (expensePayload) {
      await enqueueSync(db, 'expenses', expenseId, 'update', expensePayload);
    }
  });

  return newRows;
}

export async function deleteSplits(expenseId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    const existing = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM expense_splits WHERE expense_id = ? AND deleted_at IS NULL;',
      [expenseId],
    );
    for (const row of existing) {
      await db.runAsync(
        'UPDATE expense_splits SET deleted_at = ?, updated_at = ? WHERE id = ?;',
        [now, now, row.id],
      );
      await enqueueSync(db, 'expense_splits', row.id, 'delete', {
        id: row.id,
        deleted_at: now,
        updated_at: now,
      });
    }
    await db.runAsync(
      'UPDATE expenses SET is_split = 0, updated_at = ? WHERE id = ?;',
      [now, expenseId],
    );
    const expensePayload = await readExpensePayload(db, expenseId);
    if (expensePayload) {
      await enqueueSync(db, 'expenses', expenseId, 'update', expensePayload);
    }
  });
}

// Reads the full expense row in payload form so we can enqueue an 'update'
// sync entry that mirrors the local change to the is_split flag.
async function readExpensePayload(
  db: SQLiteDatabase,
  expenseId: string,
): Promise<Record<string, unknown> | null> {
  const row = await db.getFirstAsync<Record<string, unknown> & { id: string }>(
    'SELECT * FROM expenses WHERE id = ?;',
    [expenseId],
  );
  if (!row) return null;
  // Convert SQLite booleans (0/1) to actual booleans for the JSON payload —
  // the push pipeline's normalizePayload also coerces these, but doing it
  // here keeps the on-disk payload self-consistent with other 'update' entries.
  const out: Record<string, unknown> = { ...row };
  for (const key of [
    'is_refund',
    'is_excluded_from_daily_metrics',
    'is_private',
    'is_split',
  ]) {
    const v = out[key];
    if (v === 0 || v === 1) out[key] = v === 1;
  }
  return out;
}
