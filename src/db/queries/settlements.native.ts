import { getDatabase } from '@/db/database';
import type {
  CreateSettlementInput,
  SettlementPayment,
  SettlementPaymentRow,
} from '@/types/settlement';
import { newId } from '@/utils/id';

import type { SettlementsQueries } from './contract';
import { enqueueSync } from './syncQueue';

function rowToSettlement(row: SettlementPaymentRow): SettlementPayment {
  return {
    id: row.id,
    tripId: row.trip_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amount: row.amount,
    currency: row.currency,
    exchangeRate: row.exchange_rate,
    convertedAmount: row.converted_amount,
    settledDate: row.settled_date,
    note: row.note,
    expenseSplitId: row.expense_split_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function settlementToPayload(s: SettlementPayment): Record<string, unknown> {
  return {
    id: s.id,
    trip_id: s.tripId,
    from_user_id: s.fromUserId,
    to_user_id: s.toUserId,
    amount: s.amount,
    currency: s.currency,
    exchange_rate: s.exchangeRate,
    converted_amount: s.convertedAmount,
    settled_date: s.settledDate,
    note: s.note,
    expense_split_id: s.expenseSplitId,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    deleted_at: s.deletedAt,
  };
}

export async function listSettlementsForTrip(
  tripId: string,
): Promise<SettlementPayment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SettlementPaymentRow>(
    `SELECT * FROM settlement_payments
       WHERE trip_id = ? AND deleted_at IS NULL
       ORDER BY settled_date DESC, created_at DESC;`,
    [tripId],
  );
  return rows.map(rowToSettlement);
}

export async function listSettlementsForPair(
  tripId: string,
  userA: string,
  userB: string,
): Promise<SettlementPayment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SettlementPaymentRow>(
    `SELECT * FROM settlement_payments
       WHERE trip_id = ?
         AND deleted_at IS NULL
         AND (
           (from_user_id = ? AND to_user_id = ?)
           OR (from_user_id = ? AND to_user_id = ?)
         )
       ORDER BY settled_date DESC, created_at DESC;`,
    [tripId, userA, userB, userB, userA],
  );
  return rows.map(rowToSettlement);
}

export async function createSettlement(
  input: CreateSettlementInput,
): Promise<SettlementPayment> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const row: SettlementPayment = {
    id: newId(),
    tripId: input.tripId,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    amount: input.amount,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
    convertedAmount: input.convertedAmount,
    settledDate: input.settledDate,
    note: input.note ?? null,
    expenseSplitId: input.expenseSplitId ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO settlement_payments
         (id, trip_id, from_user_id, to_user_id, amount, currency,
          exchange_rate, converted_amount, settled_date, note, expense_split_id,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        row.id,
        row.tripId,
        row.fromUserId,
        row.toUserId,
        row.amount,
        row.currency,
        row.exchangeRate,
        row.convertedAmount,
        row.settledDate,
        row.note,
        row.expenseSplitId,
        row.createdAt,
        row.updatedAt,
        row.deletedAt,
      ],
    );
    await enqueueSync(db, 'settlement_payments', row.id, 'create', settlementToPayload(row));
  });

  return row;
}

export async function deleteSettlement(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM settlement_payments WHERE id = ? AND deleted_at IS NULL;',
      [id],
    );
    if (!existing) return;
    await db.runAsync(
      'UPDATE settlement_payments SET deleted_at = ?, updated_at = ? WHERE id = ?;',
      [now, now, id],
    );
    await enqueueSync(db, 'settlement_payments', id, 'delete', {
      id,
      deleted_at: now,
      updated_at: now,
    });
  });
}

const _check: SettlementsQueries = {
  listSettlementsForTrip,
  listSettlementsForPair,
  createSettlement,
  deleteSettlement,
};
void _check;
