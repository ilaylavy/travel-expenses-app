-- Layer settlement_payments into the analytics views.
--
--   balance_ledger — now nets recorded payments against the split-debt
--     directional gross. A payment from A to B is modeled as B owing A in
--     the bookkeeping, so the existing pairwise netting collapses it
--     naturally. Result: the AI sees the OUTSTANDING debt (not the raw
--     split debt) when answering "who owes whom" / "are we even".
--
--   settlement_history (new) — flat per-payment view for "did Alex pay me
--     back?" / "what did we settle this week?" / "show me recent payments".
--     Mirrors the security_invoker + revoke pattern of the other views.

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
    where e.deleted_at is null
      and e.is_split   = true
      and e.is_refund  = false
      and e.is_private = false
),
settlement_debts as (
    -- A payment from X to Y reduces X's debt to Y. Modeled as Y owing X
    -- in the bookkeeping so the netting below cancels it against any real
    -- X→Y debt. Over-paying flips direction (Y now owes X), which is
    -- correct: the receiver overshot what was owed.
    select
        sp.trip_id,
        sp.to_user_id   as debtor_id,
        sp.from_user_id as creditor_id,
        sp.converted_amount as debt_home
    from public.settlement_payments sp
    where sp.deleted_at is null
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
-- View 5: settlement_history
-- One row per non-deleted settlement payment. The Edge Function's planner
-- queries this for "did X pay me back?", "how much have we settled?",
-- and date-bounded history questions.
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
    sp.created_at
from public.settlement_payments sp
join public.profiles fp on fp.id = sp.from_user_id
join public.profiles tp on tp.id = sp.to_user_id
where sp.deleted_at is null;


-- =========================================================
-- Access: same shape as the rest of the analytics views — only service_role
-- can read. Explicit revoke from anon/authenticated for defense in depth.
-- =========================================================
revoke all on public.balance_ledger      from anon, authenticated;
revoke all on public.settlement_history  from anon, authenticated;

grant select on public.balance_ledger     to service_role;
grant select on public.settlement_history to service_role;
