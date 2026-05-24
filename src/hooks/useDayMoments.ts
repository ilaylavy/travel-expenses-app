import { useCallback, useEffect, useState } from 'react';

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

  return { moments, isLoading, reload };
}
