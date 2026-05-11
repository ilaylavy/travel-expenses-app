-- Per-expense settlement attribution.
--
-- A settlement may optionally be attributed to a specific expense_splits row.
-- When attributed, balance_ledger removes that split's contribution from the
-- gross-debt CTE rather than counting it as an inverse debt. Unattributed
-- settlements (the existing pair-level flow) keep working unchanged: they
-- continue to net via inverse-debt addition.
--
-- The partial UNIQUE on (expense_split_id) ensures a split has at most ONE
-- active attributed settlement. Reversing a settlement (deleted_at IS NOT
-- NULL) frees the slot so the split can be re-settled.

alter table public.settlement_payments
    add column if not exists expense_split_id uuid
        references public.expense_splits(id) on delete set null;

create unique index if not exists idx_settlement_payments_one_per_split
    on public.settlement_payments(expense_split_id)
    where deleted_at is null and expense_split_id is not null;


-- =========================================================
-- Rebuild balance_ledger to skip attributed-settled splits from gross debt.
-- Drop settlement_history first since it depends on balance_ledger? It doesn't,
-- but DROPping in reverse-dependency order is safe and matches the original
-- migration's convention.
-- =========================================================
drop view if exists public.settlement_history;
drop view if exists public.balance_ledger;

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
    -- Filter out splits that already have an active attributed settlement.
    -- LEFT JOIN against active settlement_payments via expense_split_id and
    -- keep only rows where no such settlement exists.
    left join public.settlement_payments sp
        on sp.expense_split_id = es.id
       and sp.deleted_at is null
    where e.deleted_at is null
      and e.is_split   = true
      and e.is_refund  = false
      and e.is_private = false
      and sp.id is null
),
settlement_debts as (
    -- Only UNATTRIBUTED settlements (no expense_split_id) net via inverse-debt.
    -- Attributed ones are already accounted for by removing the matching split
    -- from split_debts above.
    select
        sp.trip_id,
        sp.to_user_id   as debtor_id,
        sp.from_user_id as creditor_id,
        sp.converted_amount as debt_home
    from public.settlement_payments sp
    where sp.deleted_at is null
      and sp.expense_split_id is null
),
all_debts as (
    select * from split_debts
    union all
    select * from settlement_debts
),
gross as (
    select trip_id, debtor_id, creditor_id, sum(debt_home) as gross_debt
    from all_debts
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
-- settlement_history: expose expense_split_id and the parent expense id so
-- the AI can answer "which expenses did X settle?" without a separate JOIN
-- against expense_splits.
-- =========================================================
create view public.settlement_history
with (security_invoker = true) as
select
    sp.id,
    sp.trip_id,
    sp.from_user_id,
    fp.name as from_user_name,
    sp.to_user_id,
    tp.name as to_user_name,
    sp.amount,
    sp.currency,
    sp.exchange_rate,
    round(sp.converted_amount::numeric, 2) as amount_home,
    sp.settled_date,
    sp.note,
    sp.created_at,
    sp.expense_split_id,
    es.expense_id as linked_expense_id
from public.settlement_payments sp
join public.profiles fp on fp.id = sp.from_user_id
join public.profiles tp on tp.id = sp.to_user_id
left join public.expense_splits es on es.id = sp.expense_split_id
where sp.deleted_at is null;


-- =========================================================
-- Access: only service_role reads the views. Defense-in-depth revokes for
-- anon / authenticated (security_invoker keeps RLS active anyway).
-- =========================================================
revoke all on public.balance_ledger      from anon, authenticated;
revoke all on public.settlement_history  from anon, authenticated;

grant select on public.balance_ledger     to service_role;
grant select on public.settlement_history to service_role;
