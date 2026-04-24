import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchRate } from '@/services/exchangeRates';

export type ExchangeRateStatus = 'loading' | 'ready' | 'stale' | 'error';

export interface UseExchangeRateResult {
  rate: number | null;
  status: ExchangeRateStatus;
  refresh: () => void;
}

// Resolves an exchange rate for a currency pair on a specific date.
// - Same-currency pairs return rate=1 synchronously.
// - Invalid inputs (missing codes) stay in 'loading' without a fetch.
// - On mount, checks local cache first; on miss, falls back to network.
// - Status 'stale' means we served a cached rate from a different date
//   than requested (likely because we're offline).
export function useExchangeRate(
  base: string | null | undefined,
  target: string | null | undefined,
  date?: string,
): UseExchangeRateResult {
  const [rate, setRate] = useState<number | null>(null);
  const [status, setStatus] = useState<ExchangeRateStatus>('loading');
  const [tick, setTick] = useState(0);
  const activeRequestRef = useRef(0);

  useEffect(() => {
    if (!base || !target) {
      setRate(null);
      setStatus('loading');
      return;
    }
    if (base === target) {
      setRate(1);
      setStatus('ready');
      return;
    }

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setStatus('loading');

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchRate(base, target, date);
        if (cancelled || activeRequestRef.current !== requestId) return;
        if (!result) {
          setRate(null);
          setStatus('error');
          return;
        }
        setRate(result.rate);
        setStatus(result.stale ? 'stale' : 'ready');
      } catch {
        if (cancelled || activeRequestRef.current !== requestId) return;
        setRate(null);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [base, target, date, tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { rate, status, refresh };
}
