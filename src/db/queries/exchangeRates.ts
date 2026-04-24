import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db/database';
import type { ExchangeRate } from '@/types/exchangeRate';
import { newId } from '@/utils/id';

interface ExchangeRateRow {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: number;
  fetched_date: string;
  created_at: string;
}

function rowToRate(row: ExchangeRateRow): ExchangeRate {
  return {
    id: row.id,
    baseCurrency: row.base_currency,
    targetCurrency: row.target_currency,
    rate: row.rate,
    fetchedDate: row.fetched_date,
    createdAt: row.created_at,
  };
}

export async function getCachedRate(
  base: string,
  target: string,
  date: string,
): Promise<ExchangeRate | null> {
  if (base === target) {
    return {
      id: 'identity',
      baseCurrency: base,
      targetCurrency: target,
      rate: 1,
      fetchedDate: date,
      createdAt: date,
    };
  }
  const db = await getDatabase();
  const row = await db.getFirstAsync<ExchangeRateRow>(
    `SELECT id, base_currency, target_currency, rate, fetched_date, created_at
       FROM exchange_rates
      WHERE base_currency = ? AND target_currency = ? AND fetched_date = ?
      LIMIT 1;`,
    [base, target, date],
  );
  return row ? rowToRate(row) : null;
}

// Most recent cached rate for a pair across any date. Used as a fallback
// when network is unavailable and no same-day rate is cached.
export async function getLatestRate(
  base: string,
  target: string,
): Promise<ExchangeRate | null> {
  if (base === target) {
    const now = new Date().toISOString();
    return {
      id: 'identity',
      baseCurrency: base,
      targetCurrency: target,
      rate: 1,
      fetchedDate: now.slice(0, 10),
      createdAt: now,
    };
  }
  const db = await getDatabase();
  const row = await db.getFirstAsync<ExchangeRateRow>(
    `SELECT id, base_currency, target_currency, rate, fetched_date, created_at
       FROM exchange_rates
      WHERE base_currency = ? AND target_currency = ?
      ORDER BY fetched_date DESC
      LIMIT 1;`,
    [base, target],
  );
  return row ? rowToRate(row) : null;
}

export async function upsertRate(
  base: string,
  target: string,
  rate: number,
  date: string,
  dbOverride?: SQLiteDatabase,
): Promise<ExchangeRate> {
  const db = dbOverride ?? (await getDatabase());
  const existing = await db.getFirstAsync<ExchangeRateRow>(
    `SELECT id FROM exchange_rates
      WHERE base_currency = ? AND target_currency = ? AND fetched_date = ?
      LIMIT 1;`,
    [base, target, date],
  );
  const now = new Date().toISOString();
  if (existing) {
    await db.runAsync(
      `UPDATE exchange_rates SET rate = ? WHERE id = ?;`,
      [rate, existing.id],
    );
    return {
      id: existing.id,
      baseCurrency: base,
      targetCurrency: target,
      rate,
      fetchedDate: date,
      createdAt: now,
    };
  }
  const id = newId();
  await db.runAsync(
    `INSERT INTO exchange_rates
       (id, base_currency, target_currency, rate, fetched_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [id, base, target, rate, date, now],
  );
  return {
    id,
    baseCurrency: base,
    targetCurrency: target,
    rate,
    fetchedDate: date,
    createdAt: now,
  };
}
