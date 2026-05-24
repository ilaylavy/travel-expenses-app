// Fetcher for the journal Chapter view's day-card list. One row per day in
// the trip's window, each with counts, total, cover, and effective location.
// Mirrors useDaySummary's shape but returns the whole list rather than a
// single day. Reload is exposed so the chapter view can refresh after a
// child screen mutates data.

import { useEffect, useState } from 'react';

import * as journalDays from '@/db/queries/journalDays';
import * as journalMoments from '@/db/queries/journalMoments';
import type { DaySummary, JournalMoment } from '@/types/journal';

export function useDaySummaries(tripId: string): {
  summaries: DaySummary[];
  reload: () => Promise<void>;
  isLoading: boolean;
} {
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = async (): Promise<void> => {
    if (!tripId) {
      setSummaries([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [rows, allMoments] = await Promise.all([
        journalDays.listDaySummaries(tripId),
        journalMoments.listMomentsForTrip(tripId),
      ]);

      // Bucket moments by day date for O(1) lookup when enriching summaries.
      const momentsByDate: Record<string, JournalMoment[]> = {};
      for (const m of allMoments) {
        (momentsByDate[m.dayDate] = momentsByDate[m.dayDate] ?? []).push(m);
      }

      const enriched = rows.map((summary) => {
        const dayMoments = momentsByDate[summary.dayDate] ?? [];
        return {
          ...summary,
          momentCount: dayMoments.length,
          momentTitles: dayMoments
            .slice(0, 3)
            .map((m) => m.title ?? '')
            .filter((t) => t.length > 0),
        };
      });

      setSummaries(enriched);
    } catch (error) {
      console.warn('useDaySummaries reload failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  return { summaries, reload, isLoading };
}
