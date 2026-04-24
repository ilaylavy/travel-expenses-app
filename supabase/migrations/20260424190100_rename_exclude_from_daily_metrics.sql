-- Rename is_excluded_from_metrics to is_excluded_from_daily_metrics.
-- The flag's meaning is narrowing: previously it excluded an expense from
-- every aggregation; now it only excludes from daily chart / daily average.
-- Totals, category breakdown, top expenses, payment mix, and split balance
-- all count these expenses.

alter table public.expenses
  rename column is_excluded_from_metrics to is_excluded_from_daily_metrics;
