-- Server-side maintenance of expenses.is_split via trigger on expense_splits.
--
-- Previously this denormalized flag was maintained by app code on every
-- create/update/delete of splits. With web support landing alongside this
-- migration there are now two client codepaths that need the same
-- invariant; moving it server-side means neither has to.
--
-- After this migration ships, clients should NOT write expenses.is_split.
-- The store-level optimistic update in expenseStore covers the UI feedback;
-- the trigger keeps the database canonical, and realtime fan-out delivers
-- the value to other devices. A one-shot backfill at the bottom reconciles
-- any pre-existing drift.

-- =========================================================
-- recompute_is_split: idempotent helper that flips expenses.is_split based
-- on the current state of expense_splits for a single expense. Skips the
-- UPDATE when the flag is already correct so set_updated_at doesn't bump
-- updated_at for no reason.
-- =========================================================
create or replace function public.recompute_is_split(target_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_value boolean;
begin
    select exists (
        select 1 from public.expense_splits
        where expense_id = target_expense_id
          and deleted_at is null
    ) into new_value;

    update public.expenses
    set is_split = new_value
    where id = target_expense_id
      and is_split is distinct from new_value;
end;
$$;

-- =========================================================
-- Trigger function + trigger: fires on every expense_splits write.
-- Handles UPDATEs that move a split row across expenses (rare, but
-- correct). Returns NULL because the trigger is AFTER and we don't
-- modify the row being inserted/updated/deleted.
-- =========================================================
create or replace function public.expense_splits_maintain_is_split_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        perform public.recompute_is_split(new.expense_id);
    elsif tg_op = 'DELETE' then
        perform public.recompute_is_split(old.expense_id);
    elsif tg_op = 'UPDATE' then
        perform public.recompute_is_split(new.expense_id);
        if old.expense_id <> new.expense_id then
            perform public.recompute_is_split(old.expense_id);
        end if;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_expense_splits_maintain_is_split on public.expense_splits;
create trigger trg_expense_splits_maintain_is_split
after insert or update or delete on public.expense_splits
for each row execute function public.expense_splits_maintain_is_split_flag();

-- =========================================================
-- One-shot backfill: reconcile any existing drift between is_split and
-- the actual presence of non-deleted split rows. The CTE form ensures we
-- only UPDATE rows that actually changed.
-- =========================================================
with computed as (
    select e.id,
           exists (
               select 1 from public.expense_splits s
               where s.expense_id = e.id and s.deleted_at is null
           ) as new_value
    from public.expenses e
)
update public.expenses e
set is_split = c.new_value
from computed c
where e.id = c.id and e.is_split is distinct from c.new_value;

-- =========================================================
-- These helpers are only called from the trigger above; they should not
-- be exposed via PostgREST. Revoke EXECUTE from the API roles so they
-- don't show up under /rest/v1/rpc.
-- =========================================================
revoke execute on function public.recompute_is_split(uuid) from public, anon, authenticated;
revoke execute on function public.expense_splits_maintain_is_split_flag() from public, anon, authenticated;
