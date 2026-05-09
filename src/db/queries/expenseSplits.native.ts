import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type {
  CreateSplitInput,
  ExpenseSplit,
  ExpenseSplitRow,
} from '@/types/expense';
import { newId } from '@/utils/id';

import type { ExpenseSplitsQueries } from './contract';
import { enqueueSync } from './syncQueue';

export type { CreateSplitInput };

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
  });
}

const _check: ExpenseSplitsQueries = {
  getSplitsForExpense,
  getSplitsForTrip,
  createSplits,
  updateSplits,
  deleteSplits,
};
void _check;
