// Per-day expense aggregate used by the journal Day view's stats strip.
// Mirrors the per-day subqueries in journalDays.listDaySummaries (privacy
// + exclusion filters) but for a single day so the live summary card can
// recompute quickly after a new expense is logged without rebuilding the
// whole chapter list.
//
// Spread expenses (Lesson #8): an expense with spread_start_date /
// spread_end_date set appears on EVERY day in its range. Its amount is
// pro-rated — a €400 / 4-day spread contributes €100 to each day's total.
// Matches the per-day display in DateSection (`perDay = amount / days`).

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
  // `days_in_spread` is the inclusive day-count of the spread range
  // (start..end). For non-spread rows COALESCE collapses to expense_date so
  // the divisor is 1. julianday() returns floating-point UT-aligned day
  // numbers; the diff plus 1 gives an integer day count.
  const totalRow = await db.getFirstAsync<{ total: number; count: number }>(
    `SELECT
        COALESCE(SUM(
          converted_amount * 1.0 / (
            CAST(julianday(COALESCE(spread_end_date, expense_date))
               - julianday(COALESCE(spread_start_date, expense_date)) AS INTEGER) + 1
          )
        ), 0) AS total,
        COUNT(*) AS count
       FROM expenses
      WHERE trip_id = ?
        AND deleted_at IS NULL
        AND ? BETWEEN COALESCE(spread_start_date, expense_date)
                  AND COALESCE(spread_end_date, expense_date)
        AND is_excluded_from_daily_metrics = 0
        AND (is_private = 0 OR user_id = ?);`,
    [tripId, dayDateISO, currentUserId],
  );
  const placeRow = await db.getFirstAsync<{ place_name: string | null }>(
    `SELECT place_name FROM expenses
      WHERE trip_id = ?
        AND deleted_at IS NULL
        AND ? BETWEEN COALESCE(spread_start_date, expense_date)
                  AND COALESCE(spread_end_date, expense_date)
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
