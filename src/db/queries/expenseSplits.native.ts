import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type {
  CreateSplitInput,
  ExpenseSplit,
  ExpenseSplitRow,
} from '@/types/expense';
import { newId } from '@/utils/id';

import type { ExpenseSplitsQueries } from './contract';
import { SettlementAttributedError } from './errors';
import { enqueueSync, enqueueSyncBatch, type SyncQueueBatchItem } from './syncQueue';

// Same check used by expenses.native.ts; duplicated here to avoid a circular
// import. Any non-deleted attributed settlement that points at one of this
// expense's splits blocks the operation.
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
  if (await hasActiveAttributedSettlementForExpense(db, expenseId)) {
    throw new SettlementAttributedError();
  }
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

  const splitsToInsert: ExpenseSplit[] = [];
  const splitsToUpdate: ExpenseSplit[] = [];
  const splitsToDelete: ExpenseSplitRow[] = [];
  const syncItems: SyncQueueBatchItem[] = [];

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
      splitsToUpdate.push(next);
      syncItems.push({
        tableName: 'expense_splits',
        recordId: next.id,
        action: 'update',
        payload: splitToPayload(next),
      });
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
      splitsToInsert.push(next);
      syncItems.push({
        tableName: 'expense_splits',
        recordId: next.id,
        action: 'create',
        payload: splitToPayload(next),
      });
      result.push(next);
    }
  }

  for (const existing of existingRows) {
    if (existing.deleted_at !== null) continue;
    if (incomingByUser.has(existing.user_id)) continue;
    splitsToDelete.push(existing);
    syncItems.push({
      tableName: 'expense_splits',
      recordId: existing.id,
      action: 'delete',
      payload: {
        id: existing.id,
        deleted_at: now,
        updated_at: now,
      },
    });
  }

  await db.withTransactionAsync(async () => {
    // 1. Batch inserts
    if (splitsToInsert.length > 0) {
      const placeholders: string[] = [];
      const values: unknown[] = [];
      for (const s of splitsToInsert) {
        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
        values.push(s.id, s.expenseId, s.userId, s.amount, s.isPayer ? 1 : 0, s.createdAt, s.updatedAt, s.deletedAt);
      }
      const chunkSize = 200; // 1600 vars max
      for (let i = 0; i < splitsToInsert.length; i += chunkSize) {
        await db.runAsync(
          `INSERT INTO expense_splits
             (id, expense_id, user_id, amount, is_payer, created_at, updated_at, deleted_at)
           VALUES ${placeholders.slice(i, i + chunkSize).join(', ')};`,
          values.slice(i * 8, (i + chunkSize) * 8)
        );
      }
    }

    // 2. Batch updates
    if (splitsToUpdate.length > 0) {
      let updateStmt: any = null;
      try {
        updateStmt = await db.prepareAsync(
          `UPDATE expense_splits
             SET amount = ?, is_payer = ?, deleted_at = NULL, updated_at = ?
             WHERE id = ?;`
        );
        for (const s of splitsToUpdate) {
          await updateStmt.executeAsync([s.amount, s.isPayer ? 1 : 0, now, s.id]);
        }
      } finally {
        if (updateStmt) await updateStmt.finalizeAsync();
      }
    }

    // 3. Batch deletes
    if (splitsToDelete.length > 0) {
      let deleteStmt: any = null;
      try {
        deleteStmt = await db.prepareAsync(
          'UPDATE expense_splits SET deleted_at = ?, updated_at = ? WHERE id = ?;'
        );
        for (const existing of splitsToDelete) {
          await deleteStmt.executeAsync([now, now, existing.id]);
        }
      } finally {
        if (deleteStmt) await deleteStmt.finalizeAsync();
      }
    }

    // 4. Batch sync queue
    if (syncItems.length > 0) {
      await enqueueSyncBatch(db, syncItems);
    }
  });

  return result;
}

export async function deleteSplits(expenseId: string): Promise<void> {
  const db = await getDatabase();
  if (await hasActiveAttributedSettlementForExpense(db, expenseId)) {
    throw new SettlementAttributedError();
  }
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
