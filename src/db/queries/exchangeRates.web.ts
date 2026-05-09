// Web build of the exchange_rates query module. The native variant caches
// rates in SQLite so they survive across app launches; on web the cache is
// in-memory only — a session-scoped Map keyed by `${base}:${target}:${date}`.
// fetchRate (in services/exchangeRates) calls upsertRate every time it
// fetches, so the Map gets populated naturally without any seeding.

import type { ExchangeRate } from '@/types/exchangeRate';

import type { ExchangeRateQueries } from './contract';

interface CachedEntry {
  rate: number;
  fetchedDate: string;
  createdAt: string;
}

const cache = new Map<string, CachedEntry>();

function key(base: string, target: string, date: string): string {
  return `${base}:${target}:${date}`;
}

function identityRate(base: string, target: string, date: string): ExchangeRate {
  return {
    id: 'identity',
    baseCurrency: base,
    targetCurrency: target,
    rate: 1,
    fetchedDate: date,
    createdAt: date,
  };
}

export async function getCachedRate(
  base: string,
  target: string,
  date: string,
): Promise<ExchangeRate | null> {
  if (base === target) return identityRate(base, target, date);
  const entry = cache.get(key(base, target, date));
  if (!entry) return null;
  return {
    id: key(base, target, date),
    baseCurrency: base,
    targetCurrency: target,
    rate: entry.rate,
    fetchedDate: entry.fetchedDate,
    createdAt: entry.createdAt,
  };
}

export async function getLatestRate(
  base: string,
  target: string,
): Promise<ExchangeRate | null> {
  if (base === target) {
    const today = new Date().toISOString();
    return identityRate(base, target, today.slice(0, 10));
  }
  // Most recent entry across all dates for this pair.
  let latest: { date: string; entry: CachedEntry } | null = null;
  for (const [k, v] of cache.entries()) {
    const parts = k.split(':');
    if (parts.length !== 3) continue;
    const [b, t, d] = parts;
    if (b !== base || t !== target) continue;
    if (!latest || d > latest.date) latest = { date: d, entry: v };
  }
  if (!latest) return null;
  return {
    id: key(base, target, latest.date),
    baseCurrency: base,
    targetCurrency: target,
    rate: latest.entry.rate,
    fetchedDate: latest.entry.fetchedDate,
    createdAt: latest.entry.createdAt,
  };
}

export async function upsertRate(
  base: string,
  target: string,
  rate: number,
  date: string,
): Promise<ExchangeRate> {
  const now = new Date().toISOString();
  cache.set(key(base, target, date), { rate, fetchedDate: date, createdAt: now });
  return {
    id: key(base, target, date),
    baseCurrency: base,
    targetCurrency: target,
    rate,
    fetchedDate: date,
    createdAt: now,
  };
}

const _check: ExchangeRateQueries = {
  getCachedRate,
  getLatestRate,
  upsertRate,
};
void _check;
