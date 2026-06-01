// Web variant of sumDayExpenses. Mirrors the SQL semantics of the native
// SQLite implementation but issues Supabase fetches and performs the
// per-day pro-rating / count / most-frequent-place reduction in JS — the
// same pattern listDaySummaries already uses for many days at once.
//
// Spread expenses (Lesson #8): an expense with spread_start_date /
// spread_end_date set appears on EVERY day in its range. Its amount is
// pro-rated — a EUR400 / 4-day spread contributes EUR100 to each day's
// total. The pro-rating divisor is the inclusive day-count of the spread
// range (start..end); non-spread rows collapse to expense_date so the
// divisor is 1.
//
// Filter asymmetry matching the native variant:
//   - total/count query filters: deleted_at IS NULL, is_excluded_from_daily_metrics=false,
//     in-range, privacy.
//   - mostFrequentPlace query: same EXCEPT it does NOT filter is_excluded
//     (excluded-from-metrics expenses still inform the inferred location).

import { supabase } from '@/services/supabase';

export interface DayExpenseAggregate {
  total: number;
  count: number;
  mostFrequentPlace: string | null;
}

interface ExpenseRow {
  converted_amount: number | null;
  expense_date: string;
  spread_start_date: string | null;
  spread_end_date: string | null;
  place_name: string | null;
  is_private: boolean | null;
  user_id: string;
}

function daysInSpread(row: { spread_start_date: string | null; spread_end_date: string | null; expense_date: string }): number {
  const start = row.spread_start_date ?? row.expense_date;
  const end = row.spread_end_date ?? row.expense_date;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 1;
  const days = Math.round((endMs - startMs) / 86_400_000) + 1;
  return days < 1 ? 1 : days;
}

function dayInRange(row: { spread_start_date: string | null; spread_end_date: string | null; expense_date: string }, dayDateISO: string): boolean {
  const start = row.spread_start_date ?? row.expense_date;
  const end = row.spread_end_date ?? row.expense_date;
  return start <= dayDateISO && dayDateISO <= end;
}

// Supabase-js can't express `dayDate BETWEEN COALESCE(spread_start_date,
// expense_date) AND COALESCE(spread_end_date, expense_date)` directly, so
// we widen the net with two OR conditions and finish the filter in JS.
// Two cases to cover:
//   (a) Non-spread rows: expense_date = dayDateISO AND spread_start IS NULL.
//   (b) Spread rows: spread_start <= dayDateISO AND spread_end >= dayDateISO.
const dayRangeFilter = (dayDateISO: string): string =>
  `and(spread_start_date.is.null,expense_date.eq.${dayDateISO}),and(spread_start_date.lte.${dayDateISO},spread_end_date.gte.${dayDateISO})`;

export async function sumDayExpenses(
  tripId: string,
  dayDateISO: string,
  currentUserId: string,
): Promise<DayExpenseAggregate> {
  // Run the two native queries in parallel — they have different filter
  // semantics around is_excluded_from_daily_metrics.
  const [
    { data: totalData, error: totalErr },
    { data: placeData, error: placeErr },
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select(
        'converted_amount, expense_date, spread_start_date, spread_end_date, is_private, user_id',
      )
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .eq('is_excluded_from_daily_metrics', false)
      .or(dayRangeFilter(dayDateISO)),
    supabase
      .from('expenses')
      .select(
        'place_name, expense_date, spread_start_date, spread_end_date, is_private, user_id',
      )
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .not('place_name', 'is', null)
      .or(dayRangeFilter(dayDateISO)),
  ]);
  if (totalErr) throw totalErr;
  if (placeErr) throw placeErr;

  // total + count pass
  let total = 0;
  let count = 0;
  for (const row of (totalData ?? []) as ExpenseRow[]) {
    if (row.is_private && row.user_id !== currentUserId) continue;
    if (!dayInRange(row, dayDateISO)) continue;
    total += (row.converted_amount ?? 0) / daysInSpread(row);
    count += 1;
  }

  // mostFrequentPlace pass — uses a separate row set because the native
  // SQL does NOT apply the is_excluded filter to this query.
  const placeCounts = new Map<string, number>();
  for (const row of (placeData ?? []) as ExpenseRow[]) {
    if (row.is_private && row.user_id !== currentUserId) continue;
    if (!dayInRange(row, dayDateISO)) continue;
    if (!row.place_name) continue;
    placeCounts.set(row.place_name, (placeCounts.get(row.place_name) ?? 0) + 1);
  }

  let mostFrequentPlace: string | null = null;
  let bestCount = 0;
  for (const [place, c] of placeCounts) {
    if (c > bestCount || (c === bestCount && (mostFrequentPlace === null || place < mostFrequentPlace))) {
      bestCount = c;
      mostFrequentPlace = place;
    }
  }

  return { total, count, mostFrequentPlace };
}
