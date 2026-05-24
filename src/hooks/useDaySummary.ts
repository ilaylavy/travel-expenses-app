// Fetcher for the journal Today view's summary card. Aggregates counts,
// cover photo, and effective location for a single (tripId, dayDate). The
// chapter list resolves cover overrides server-side; here we use the day's
// pinned cover (via coverPhotoEntryId) if set, otherwise fall back to the
// first-uploaded photo as the cover.

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
      const [photoCount, voiceCount, meta, fallbackCoverPath, expenseTotals] = await Promise.all([
        journalPhotoEntries.countPhotosForTripDay(tripId, dayDateISO),
        voiceClips.countClipsForTripDay(tripId, dayDateISO),
        journalDays.getDayMetadata(tripId, dayDateISO),
        journalPhotoEntries.firstPhotoStoragePathForDay(tripId, dayDateISO),
        sumDayExpenses(tripId, dayDateISO, me),
      ]);

      // Prefer the day's explicitly-pinned cover (resolved via its entry_id),
      // falling back to the first photo of the day.
      let coverStoragePath: string | null = fallbackCoverPath;
      if (meta?.coverPhotoEntryId) {
        const pinned = await journalPhotoEntries.storagePathForEntry(meta.coverPhotoEntryId);
        if (pinned) coverStoragePath = pinned;
      }

      setData({
        totalConvertedAmount: expenseTotals.total,
        photoCount,
        voiceCount,
        expenseCount: expenseTotals.count,
        coverStoragePath,
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
