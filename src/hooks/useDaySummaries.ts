// Fetcher for the journal Chapter view's day-card list. One row per day in
// the trip's window, each with counts, total, cover, and effective location.
// Mirrors useDaySummary's shape but returns the whole list rather than a
// single day. Reload is exposed so the chapter view can refresh after a
// child screen mutates data.

import { useEffect, useState } from 'react';

import * as journalDays from '@/db/queries/journalDays';
import { useAuthStore } from '@/stores/authStore';
import type { DaySummary } from '@/types/journal';

export function useDaySummaries(tripId: string): {
  summaries: DaySummary[];
  reload: () => Promise<void>;
  isLoading: boolean;
} {
  const me = useAuthStore((s) => s.session?.user.id ?? '');
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = async (): Promise<void> => {
    if (!tripId || !me) {
      setSummaries([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const rows = await journalDays.listDaySummaries(tripId, me);
      setSummaries(rows);
    } catch (error) {
      console.warn('useDaySummaries reload failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, me]);

  return { summaries, reload, isLoading };
}
