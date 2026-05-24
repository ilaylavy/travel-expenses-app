import { useEffect, useState } from 'react';

import * as journalDays from '@/db/queries/journalDays';
import { useTripStore } from '@/stores/tripStore';

/**
 * Resolves the cover photo storage path for a trip.
 *
 * Fallback chain:
 *  1. trip.coverPhotoStoragePath (explicit cover set by user on the trip)
 *  2. First day summary that has a cover storage path
 *  3. null
 */
export function useTripCover(tripId: string): string | null {
  const trip = useTripStore((s) => s.trips.find((t) => t.id === tripId) ?? null);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!trip) {
        setResolved(null);
        return;
      }
      if (trip.coverPhotoStoragePath) {
        setResolved(trip.coverPhotoStoragePath);
        return;
      }
      try {
        // listDaySummaries still requires currentUserId for expense-based
        // inferred_location filtering. We don't have the user here, so we
        // query with an empty string — the cover_storage_path column comes
        // from journal_photos (no user filter) so the relevant field is
        // unaffected. Task 2.10 will drop this param entirely.
        const summaries = await journalDays.listDaySummaries(tripId, '');
        const firstWithCover = summaries.find((d) => d.coverStoragePath);
        if (!cancelled) setResolved(firstWithCover?.coverStoragePath ?? null);
      } catch {
        if (!cancelled) setResolved(null);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  return resolved;
}
