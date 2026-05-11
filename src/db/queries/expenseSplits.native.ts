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

  // Pull every existing row for the expense, INCLUDING soft-deleted ones.
  // The UNIQUE (expense_id, user_id) constraint is full-table (not partial),
  // so a previously soft-deleted row still blocks a fresh INSERT for the
  // same (expense_id, user_id) pair. Reusing the existing row's id avoids
  // the collision entirely — and resurrects soft-deletes by clearing
  // deleted_at when a user comes back into the split.
  const existingRows = await db.getAllAsync<ExpenseSplitRow>(
    'SELECT * FROM expense_splits WHERE expense_id = ?;',
    [expenseId],
  );
  const existingByUser = new Map<string, ExpenseSplitRow>();
  for (const row of existingRows) existingByUser.set(row.user_id, row);

  const incomingByUser = new Set<string>();
  for (const s of splits) incomingByUser.add(s.userId);

  const result: ExpenseSplit[] = [];

  await db.withTransactionAsync(async () => {
    // Upsert each incoming split by user_id. Existing → UPDATE in place;
    // new user → INSERT a fresh row.
    for (const incoming of splits) {
      const existing = existingByUser.get(incoming.userId);
      if (existing) {
        const next: ExpenseSplit = {
          id: existing.id,
          expenseId,
          userId: incoming.userId,
          amount: incoming.amount,
          isPayer: incoming.isPayer,
          createdAt: existing.created_at,
          updatedAt: now,
          deletedAt: null,
        };
        await db.runAsync(
          `UPDATE expense_splits
             SET amount = ?, is_payer = ?, deleted_at = NULL, updated_at = ?
             WHERE id = ?;`,
          [next.amount, next.isPayer ? 1 : 0, now, next.id],
        );
        await enqueueSync(db, 'expense_splits', next.id, 'update', splitToPayload(next));
        result.push(next);
      } else {
        const next: ExpenseSplit = {
          id: newId(),
          expenseId,
          userId: incoming.userId,
          amount: incoming.amount,
          isPayer: incoming.isPayer,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        await insertSplit(db, next);
        await enqueueSync(db, 'expense_splits', next.id, 'create', splitToPayload(next));
        result.push(next);
      }
    }

    // Soft-delete rows whose user dropped out of the new set. Skip rows that
    // are already soft-deleted — no need to re-queue an idempotent delete.
    for (const existing of existingRows) {
      if (existing.deleted_at !== null) continue;
      if (incomingByUser.has(existing.user_id)) continue;
      await db.runAsync(
        'UPDATE expense_splits SET deleted_at = ?, updated_at = ? WHERE id = ?;',
        [now, now, existing.id],
      );
      await enqueueSync(db, 'expense_splits', existing.id, 'delete', {
        id: existing.id,
        deleted_at: now,
        updated_at: now,
      });
    }
  });

  return result;
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
