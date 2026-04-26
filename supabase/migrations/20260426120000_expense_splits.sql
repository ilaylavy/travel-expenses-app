-- Per-expense splits for shared trips.
--
-- expense_splits decomposes a shared expense into per-member shares. The expense
-- itself is the source of truth for total/currency/payer (via the row that has
-- is_payer=true). is_split on expenses is a denormalized flag mirroring "has
-- any non-deleted split rows", maintained by app code, used by the list query
-- to avoid an extra JOIN per row.

alter table public.expenses
    add column if not exists is_split boolean not null default false;

create table if not exists public.expense_splits (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.expenses(id) on delete cascade,
    user_id uuid not null references public.profiles(id),
    amount decimal(12,2) not null,
    is_payer boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    unique (expense_id, user_id)
);

create index if not exists idx_expense_splits_expense_id on public.expense_splits(expense_id);
create index if not exists idx_expense_splits_user_id on public.expense_splits(user_id);

-- updated_at trigger (mirrors expenses)
drop trigger if exists trg_set_updated_at on public.expense_splits;
create trigger trg_set_updated_at
before update on public.expense_splits
for each row execute function public.set_updated_at();

-- =========================================================
-- RLS: same shape as expenses, gated through the parent expense so the
-- privacy filter rides along. Only the expense author may write splits.
-- =========================================================
alter table public.expense_splits enable row level security;

-- SELECT: trip members can see splits for any expense visible to them
-- (i.e. non-private, or private and authored by the caller).
drop policy if exists "expense_splits_select_trip_member" on public.expense_splits;
create policy "expense_splits_select_trip_member"
    on public.expense_splits for select
    to authenticated
    using (
        exists (
            select 1 from public.expenses e
            where e.id = expense_splits.expense_id
              and app_private.is_trip_member(e.trip_id)
              and (e.is_private = false or e.user_id = (select auth.uid()))
        )
    );

-- INSERT: only the author of the parent expense may create splits.
drop policy if exists "expense_splits_insert_author" on public.expense_splits;
create policy "expense_splits_insert_author"
    on public.expense_splits for insert
    to authenticated
    with check (
        exists (
            select 1 from public.expenses e
            where e.id = expense_splits.expense_id
              and app_private.is_trip_member(e.trip_id)
              and e.user_id = (select auth.uid())
        )
    );

-- UPDATE: only the author of the parent expense may modify splits.
drop policy if exists "expense_splits_update_author" on public.expense_splits;
create policy "expense_splits_update_author"
    on public.expense_splits for update
    to authenticated
    using (
        exists (
            select 1 from public.expenses e
            where e.id = expense_splits.expense_id
              and app_private.is_trip_member(e.trip_id)
              and e.user_id = (select auth.uid())
        )
    )
    with check (
        exists (
            select 1 from public.expenses e
            where e.id = expense_splits.expense_id
              and app_private.is_trip_member(e.trip_id)
              and e.user_id = (select auth.uid())
        )
    );

-- DELETE: only the author of the parent expense may delete splits.
drop policy if exists "expense_splits_delete_author" on public.expense_splits;
create policy "expense_splits_delete_author"
    on public.expense_splits for delete
    to authenticated
    using (
        exists (
            select 1 from public.expenses e
            where e.id = expense_splits.expense_id
              and app_private.is_trip_member(e.trip_id)
              and e.user_id = (select auth.uid())
        )
    );

-- =========================================================
-- Realtime: include expense_splits so partner devices see splits arrive
-- alongside the parent expense.
-- =========================================================
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.expense_splits;
    end if;
exception
    when duplicate_object then null;
end $$;
