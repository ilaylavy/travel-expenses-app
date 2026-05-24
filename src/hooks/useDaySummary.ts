// Fetcher for the journal Today view's summary card. Aggregates counts,
// cover photo, and effective location for a single (tripId, dayDate). The
// chapter list resolves cover overrides server-side; here we use the day's
// first-uploaded photo as the cover — once a user pins a cover, the chapter
// view will pick it up and the override propagates to other surfaces.

import { useEffect, useState } from 'react';

import * as journalDays from '@/db/queries/journalDays';
import * as journalPhotoEntries from '@/db/queries/journalPhotoEntries';
import * as voiceClips from '@/db/queries/voiceClips';
import { useAuthStore } from '@/stores/authStore';
import type { JournalDay } from '@/types/journal';
import { sumDayExpenses } from '@/utils/dailyTotals';

export interface DaySummaryData {
  totalConvertedAmount: number;
  photoCount: number;
  voiceCount: number;
  expenseCount: number;
  coverStoragePath: string | null;
  effectiveLocation: string | null;
  meta: JournalDay | null;
  isLoading: boolean;
}

const EMPTY: DaySummaryData = {
  totalConvertedAmount: 0,
  photoCount: 0,
  voiceCount: 0,
  expenseCount: 0,
  coverStoragePath: null,
  effectiveLocation: null,
  meta: null,
  isLoading: true,
};

export function useDaySummary(
  tripId: string,
  dayDateISO: string,
): DaySummaryData & { reload: () => Promise<void> } {
  const me = useAuthStore((s) => s.session?.user.id ?? '');
  const [data, setData] = useState<DaySummaryData>(EMPTY);

  const reload = async (): Promise<void> => {
    if (!tripId || !me) return;
    try {
      const [photoCount, voiceCount, meta, coverPath, expenseTotals] = await Promise.all([
        journalPhotoEntries.countPhotosForTripDay(tripId, dayDateISO, me),
        voiceClips.countClipsForTripDay(tripId, dayDateISO, me),
        journalDays.getDayMetadata(tripId, dayDateISO),
        journalPhotoEntries.firstPhotoStoragePathForDay(tripId, dayDateISO, me),
        sumDayExpenses(tripId, dayDateISO, me),
      ]);
      setData({
        totalConvertedAmount: expenseTotals.total,
        photoCount,
        voiceCount,
        expenseCount: expenseTotals.count,
        // Live card uses first-photo as the cover fallback; chapter view
        // resolves the cover override server-side. Once Task 3 introduces
        // a "set as cover" action we can re-fetch the override here too.
        coverStoragePath: coverPath,
        effectiveLocation: meta?.location ?? expenseTotals.mostFrequentPlace,
        meta,
        isLoading: false,
      });
    } catch (error) {
      console.warn('useDaySummary reload failed:', error);
      setData((prev) => ({ ...prev, isLoading: false }));
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, dayDateISO, me]);

  return { ...data, reload };
}
