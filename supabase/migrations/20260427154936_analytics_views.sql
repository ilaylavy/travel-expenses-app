-- Analytics views for the AI query Edge Function.
--
-- The ai-query Edge Function generates SQL against raw expenses /
-- expense_splits and the LLM keeps getting the hard parts wrong: per-user
-- splits (ratio of expense_splits.amount over expense.amount times
-- converted_amount), spread-expense daily distribution (divide by day count),
-- and pairwise debt netting. These four views pre-compute that logic so the
-- planner can ask flat, easy questions ("sum user_share where share_owner_id
-- = X") and never has to re-derive split semantics by hand.
--
-- Privacy notes (the Edge Function still applies the explicit caller filter):
--   * expense_analysis / daily_spending: rows are emitted with
--     share_owner_id == payer_id only when is_private = true, so the
--     Edge Function's (is_private = false OR share_owner_id = '<caller>')
--     filter cleanly hides other members' private expenses.
--   * balance_ledger: excludes private expenses entirely (private spending
--     is not part of the shared balance, by design).
--   * trip_summary: aggregates from expense_analysis, so the caller's private
--     expenses appear only in their own row; never in another member's row.
--
-- All four views are defined WITH (security_invoker = true) so any accidental
-- query from an authenticated client still goes through RLS on the underlying
-- tables. SELECT is also revoked from anon / authenticated for defense in
-- depth; only service_role (used by the Edge Function) can read them.

-- Drop in dependency order so re-running the migration during development
-- never trips on a column-shape change in CREATE OR REPLACE VIEW.
drop view if exists public.daily_spending;
drop view if exists public.trip_summary;
drop view if exists public.balance_ledger;
drop view if exists public.expense_analysis;


-- =========================================================
-- View 1: expense_analysis
-- One row per share-owner per expense.
--   * Non-split: 1 row, share_owner = payer, user_share = full_amount.
--   * Split:    N rows, one per non-deleted expense_splits row.
-- The split branch derives user_share_home by ratio so the home-currency
-- conversion exactly mirrors src/utils/share.ts::userShareConverted().
-- =========================================================
create view public.expense_analysis
with (security_invoker = true) as
with base as (
    select
        e.*,
        payer.name as payer_name,
        c.name as category_name,
        c.emoji as category_emoji
    from public.expenses e
    join public.profiles payer on payer.id = e.user_id
    join public.categories c on c.id = e.category_id
    where e.deleted_at is null
)
-- Non-split branch
select
    b.id                  as expense_id,
    b.trip_id,
    b.user_id             as payer_id,
    b.payer_name,
    b.user_id             as share_owner_id,
    b.payer_name          as share_owner_name,
    true                  as is_payer_of_share,
    b.amount              as full_amount,
    b.converted_amount    as full_amount_home,
    b.amount              as user_share,
    b.converted_amount    as user_share_home,
    b.currency            as original_currency,
    b.category_id,
    b.category_name,
    b.category_emoji,
    b.expense_date,
    b.expense_time,
    b.place_name,
    b.latitude,
    b.longitude,
    b.note,
    b.payment_method,
    b.is_refund,
    b.is_excluded_from_daily_metrics,
    b.is_private,
    b.is_split,
    b.spread_start_date,
    b.spread_end_date
from base b
where b.is_split = false

union all

-- Split branch
select
    b.id                  as expense_id,
    b.trip_id,
    b.user_id             as payer_id,
    b.payer_name,
    es.user_id            as share_owner_id,
    sp.name               as share_owner_name,
    (es.user_id = b.user_id) as is_payer_of_share,
    b.amount              as full_amount,
    b.converted_amount    as full_amount_home,
    es.amount             as user_share,
    case when b.amount = 0 then 0
         else b.converted_amount * (es.amount / b.amount)
    end                   as user_share_home,
    b.currency            as original_currency,
    b.category_id,
    b.category_name,
    b.category_emoji,
    b.expense_date,
    b.expense_time,
    b.place_name,
    b.latitude,
    b.longitude,
    b.note,
    b.payment_method,
    b.is_refund,
    b.is_excluded_from_daily_metrics,
    b.is_private,
    b.is_split,
    b.spread_start_date,
    b.spread_end_date
from base b
join public.expense_splits es
    on es.expense_id = b.id
   and es.deleted_at is null
join public.profiles sp on sp.id = es.user_id
where b.is_split = true
  -- Defensive: a private expense should not have splits by design, but if it
  -- ever did, only emit a row for the author so other members never see it.
  and (b.is_private = false or es.user_id = b.user_id);


-- =========================================================
-- View 2: daily_spending
-- One row per (trip, share_owner, expense_date). Spread expenses are exploded
-- via generate_series and divided evenly across the date range, mirroring
-- src/utils/expenseGrouping.ts::expandExpense() and the dailyContributing
-- filter in src/utils/statsAggregations.ts (refunds + excluded-from-daily out).
-- =========================================================
create view public.daily_spending
with (security_invoker = true) as
with expanded as (
    select
        ea.trip_id,
        ea.share_owner_id,
        ea.share_owner_name,
        gs.day::date as expense_date,
        ea.user_share      / ea.day_count as slice_share,
        ea.user_share_home / ea.day_count as slice_share_home,
        ea.expense_id
    from (
        select
            ea.*,
            case when ea.spread_start_date is not null
                  and ea.spread_end_date   is not null
                  and ea.spread_end_date >= ea.spread_start_date
                 then (ea.spread_end_date - ea.spread_start_date) + 1
                 else 1
            end as day_count,
            case when ea.spread_start_date is not null
                  and ea.spread_end_date   is not null
                  and ea.spread_end_date >= ea.spread_start_date
                 then ea.spread_start_date
                 else ea.expense_date
            end as range_start,
            case when ea.spread_start_date is not null
                  and ea.spread_end_date   is not null
                  and ea.spread_end_date >= ea.spread_start_date
                 then ea.spread_end_date
                 else ea.expense_date
            end as range_end
        from public.expense_analysis ea
        where ea.is_excluded_from_daily_metrics = false
          and ea.is_refund = false
    ) ea,
    lateral generate_series(
        ea.range_start::timestamp,
        ea.range_end::timestamp,
        interval '1 day'
    ) as gs(day)
)
select
    trip_id,
    share_owner_id,
    share_owner_name,
    expense_date,
    sum(slice_share)              as daily_amount,
    sum(slice_share_home)         as daily_amount_home,
    count(distinct expense_id)    as expense_count
from expanded
group by trip_id, share_owner_id, share_owner_name, expense_date;


-- =========================================================
-- View 3: trip_summary
-- One row per (trip, active member). Pre-aggregates everything needed for
-- "am I on budget", "how much have I spent total", "daily average",
-- "days remaining". Active member = trip_members.joined_at IS NOT NULL
-- (pending invites are rows with joined_at = null, filtered out).
-- Budget comparison is in home_currency since trip_members.budget is stored
-- in home_currency.
-- =========================================================
create view public.trip_summary
with (security_invoker = true) as
select
    t.id              as trip_id,
    t.name            as trip_name,
    t.emoji           as trip_emoji,
    t.start_date,
    t.end_date,
    t.base_currency,
    t.home_currency,
    tm.user_id,
    p.name            as user_name,
    tm.budget         as per_user_budget,
    coalesce(agg.total_spent_share, 0)      as total_spent_share,
    coalesce(agg.total_spent_share_home, 0) as total_spent_share_home,
    coalesce(agg.total_paid, 0)             as total_paid,
    coalesce(agg.total_paid_home, 0)        as total_paid_home,
    coalesce(agg.expense_count, 0)          as expense_count,
    dates.days_elapsed,
    dates.days_remaining,
    coalesce(agg.total_spent_share, 0)      / dates.days_elapsed as daily_average_share,
    coalesce(agg.total_spent_share_home, 0) / dates.days_elapsed as daily_average_share_home,
    case when tm.budget is null then null
         else tm.budget - coalesce(agg.total_spent_share_home, 0)
    end as budget_remaining,
    case when tm.budget is null or tm.budget = 0 then null
         else coalesce(agg.total_spent_share_home, 0) / tm.budget * 100
    end as budget_percent
from public.trips t
join public.trip_members tm
    on tm.trip_id = t.id
   and tm.joined_at is not null
join public.profiles p on p.id = tm.user_id
join lateral (
    select
        greatest(1, least(
            current_date - t.start_date + 1,
            coalesce(t.end_date - t.start_date + 1, current_date - t.start_date + 1)
        )) as days_elapsed,
        case when t.end_date is null then null
             when t.end_date < current_date then 0
             else t.end_date - current_date
        end as days_remaining
) dates on true
left join lateral (
    select
        sum(ea.user_share)            filter (where not ea.is_refund) as total_spent_share,
        sum(ea.user_share_home)       filter (where not ea.is_refund) as total_spent_share_home,
        sum(ea.full_amount)           filter (where ea.is_payer_of_share and not ea.is_refund) as total_paid,
        sum(ea.full_amount_home)      filter (where ea.is_payer_of_share and not ea.is_refund) as total_paid_home,
        count(distinct ea.expense_id) filter (where not ea.is_refund) as expense_count
    from public.expense_analysis ea
    where ea.trip_id = t.id
      and ea.share_owner_id = tm.user_id
) agg on true
where t.deleted_at is null;


-- =========================================================
-- View 4: balance_ledger
-- One row per (trip, debtor, creditor) with the netted positive debt in
-- home_currency. Mirrors src/utils/balance.ts pairwise netting:
-- gross(a→b) is summed across all split expenses, then net = gross(a→b)
-- - gross(b→a). Only the positive direction is emitted (the loser of the
-- netting). Refunds and private expenses are excluded entirely.
-- =========================================================
create view public.balance_ledger
with (security_invoker = true) as
with split_debts as (
    select
        e.trip_id,
        es.user_id as debtor_id,
        e.user_id  as creditor_id,
        case when e.amount = 0 then 0
             else e.converted_amount * (es.amount / e.amount)
        end as debt_home
    from public.expenses e
    join public.expense_splits es
        on es.expense_id = e.id
       and es.deleted_at is null
       and es.is_payer = false
       and es.user_id <> e.user_id
    where e.deleted_at is null
      and e.is_split   = true
      and e.is_refund  = false
      and e.is_private = false
),
gross as (
    select trip_id, debtor_id, creditor_id, sum(debt_home) as gross_debt
    from split_debts
    group by trip_id, debtor_id, creditor_id
),
netted as (
    select
        a.trip_id,
        a.debtor_id   as from_user_id,
        a.creditor_id as to_user_id,
        a.gross_debt - coalesce(b.gross_debt, 0) as net_amount
    from gross a
    left join gross b
        on b.trip_id = a.trip_id
       and b.debtor_id   = a.creditor_id
       and b.creditor_id = a.debtor_id
)
select
    n.trip_id,
    n.from_user_id,
    fp.name as from_user_name,
    n.to_user_id,
    tp.name as to_user_name,
    round(n.net_amount::numeric, 2) as net_amount,
    t.home_currency as currency
from netted n
join public.trips    t  on t.id = n.trip_id and t.deleted_at is null
join public.profiles fp on fp.id = n.from_user_id
join public.profiles tp on tp.id = n.to_user_id
where n.net_amount > 0.005;


-- =========================================================
-- Indexes to support view scans.
-- The existing per-column indexes (idx_expenses_trip_id, idx_expenses_date,
-- idx_expense_splits_expense_id, idx_expense_splits_user_id) cover most
-- patterns. Add two narrowly-targeted partial indexes for the active subset.
-- =========================================================

-- daily_spending and trip_summary scan active expenses for a trip; this
-- partial composite is much smaller than a full (trip_id, expense_date) index
-- because soft-deleted rows are excluded by definition.
create index if not exists idx_expenses_trip_date_active
    on public.expenses (trip_id, expense_date)
    where deleted_at is null;

-- Speeds up the expense_analysis split-branch join and balance_ledger.
create index if not exists idx_expense_splits_active
    on public.expense_splits (expense_id, user_id)
    where deleted_at is null;


-- =========================================================
-- Privacy & access: views are queried by the Edge Function with service_role;
-- explicitly revoke from anon / authenticated for defense in depth.
-- security_invoker = true (set on each view) keeps RLS active for any
-- accidental authenticated query that does slip through.
-- =========================================================
revoke all on public.expense_analysis from anon, authenticated;
revoke all on public.daily_spending   from anon, authenticated;
revoke all on public.trip_summary     from anon, authenticated;
revoke all on public.balance_ledger   from anon, authenticated;

grant select on public.expense_analysis to service_role;
grant select on public.daily_spending   to service_role;
grant select on public.trip_summary     to service_role;
grant select on public.balance_ledger   to service_role;
