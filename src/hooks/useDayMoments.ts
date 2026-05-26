import { useCallback, useEffect, useMemo, useState } from 'react';

import * as journalMoments from '@/db/queries/journalMoments';
import type { JournalMoment } from '@/types/journal';

export interface DayMomentsState {
  moments: JournalMoment[];
  isLoading: boolean;
  reload: () => Promise<void>;
}

export function useDayMoments(tripId: string, dayDate: string): DayMomentsState {
  const [moments, setMoments] = useState<JournalMoment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async (): Promise<void> => {
    if (!tripId || !dayDate) {
      setMoments([]);
      setIsLoading(false);
      return;
    }
    try {
      const list = await journalMoments.listMomentsForDay(tripId, dayDate);
      setMoments(list);
    } catch (error) {
      console.warn('useDayMoments reload failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [tripId, dayDate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Stable return object. Without useMemo, every render produces a fresh
  // `{ moments, isLoading, reload }` object even when the underlying state
  // didn't change. Consumers that include the whole hook result in a
  // useFocusEffect / useEffect dep list (e.g. DayScreen) would then re-fire
  // on every render → infinite loop. Memoize so the object identity tracks
  // the actual state.
  return useMemo(
    () => ({ moments, isLoading, reload }),
    [moments, isLoading, reload],
  );
}
