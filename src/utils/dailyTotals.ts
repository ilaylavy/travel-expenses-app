// Per-day expense aggregate used by the journal Today view. Mirrors the
// per-day subqueries in journalDays.listDaySummaries (privacy + exclusion
// filters) but for a single day so the live summary card can recompute
// quickly after a new expense is logged without rebuilding the whole
// chapter list.

import { getDatabase } from '@/db/database';

export interface DayExpenseAggregate {
  total: number;
  count: number;
  mostFrequentPlace: string | null;
}

export async function sumDayExpenses(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<DayExpenseAggregate> {
  const db = await getDatabase();
  const totalRow = await db.getFirstAsync<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(converted_amount), 0) AS total, COUNT(*) AS count
       FROM expenses
      WHERE trip_id = ? AND expense_date = ? AND deleted_at IS NULL
        AND is_excluded_from_daily_metrics = 0
        AND (is_private = 0 OR user_id = ?);`,
    [tripId, dayDateISO, currentUserId],
  );
  const placeRow = await db.getFirstAsync<{ place_name: string | null }>(
    `SELECT place_name FROM expenses
      WHERE trip_id = ? AND expense_date = ? AND deleted_at IS NULL
        AND place_name IS NOT NULL
        AND (is_private = 0 OR user_id = ?)
      GROUP BY place_name
      ORDER BY COUNT(*) DESC, place_name ASC
      LIMIT 1;`,
    [tripId, dayDateISO, currentUserId],
  );
  return {
    total: totalRow?.total ?? 0,
    count: totalRow?.count ?? 0,
    mostFrequentPlace: placeRow?.place_name ?? null,
  };
}
