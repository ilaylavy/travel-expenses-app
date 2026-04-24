// Fetches currency exchange rates and caches them in local SQLite. Cache is
// keyed by (base, target, date) so each pair is fetched at most once per day.
// Network failure falls back to the most recently cached rate for the pair.
//
// Provider: open.er-api.com (exchangerate-api.com free tier). No API key
// required; returns a complete rate table against a single base currency,
// updated daily. One network call populates the cache for *all* target
// currencies, so subsequent lookups against the same base are instant.
//
// exchangerate.host was the original choice per the spec, but its free tier
// now requires a paid API key (returns error 101 without one), so the app
// would have shown "Rate unavailable" everywhere.

import {
  getCachedRate,
  getLatestRate,
  upsertRate,
} from '@/db/queries/exchangeRates';
import { roundRate, todayDateString } from '@/utils/currency';

const BASE_URL = 'https://open.er-api.com/v6/latest';
const FETCH_TIMEOUT_MS = 5000;

interface LatestResponse {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
}

export interface FetchRateResult {
  rate: number;
  fromCache: boolean;
  stale: boolean;
  date: string;
}

export async function fetchRate(
  base: string,
  target: string,
  date?: string,
): Promise<FetchRateResult | null> {
  if (base === target) {
    return {
      rate: 1,
      fromCache: true,
      stale: false,
      date: date ?? todayDateString(),
    };
  }

  const requestedDate = date ?? todayDateString();
  const cached = await getCachedRate(base, target, requestedDate);
  if (cached) {
    return {
      rate: cached.rate,
      fromCache: true,
      stale: false,
      date: cached.fetchedDate,
    };
  }

  try {
    const rates = await fetchAllRatesFromApi(base);
    if (rates) {
      // Populate the cache with every pair returned, so subsequent lookups
      // against the same base skip the network.
      const today = todayDateString();
      const entries = Object.entries(rates);
      for (const [code, value] of entries) {
        if (code === base) continue;
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        await upsertRate(base, code, roundRate(value), today);
      }
      const directRate = rates[target];
      if (typeof directRate === 'number' && Number.isFinite(directRate)) {
        return {
          rate: roundRate(directRate),
          fromCache: false,
          stale: false,
          date: today,
        };
      }
    }
  } catch {
    // Offline-first: swallow network errors and fall back to cache.
  }

  const latest = await getLatestRate(base, target);
  if (latest) {
    return {
      rate: latest.rate,
      fromCache: true,
      stale: latest.fetchedDate !== requestedDate,
      date: latest.fetchedDate,
    };
  }

  return null;
}

async function fetchAllRatesFromApi(
  base: string,
): Promise<Record<string, number> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${BASE_URL}/${encodeURIComponent(base)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as LatestResponse;
    if (json.result !== 'success' || !json.rates) return null;
    return json.rates;
  } finally {
    clearTimeout(timeout);
  }
}
