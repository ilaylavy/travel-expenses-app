-- Settlement payments — record actual debt-settlement events between two trip
-- members. Layered on top of expense_splits: a settlement payment from A to B
-- reduces A's net debt to B without changing anyone's share of trip cost.
--
-- Settlements are pair-level events, not expense-level: we do NOT attribute a
-- payment to a specific expense or split row. balance.ts nets them against
-- the pairwise debt produced by per-expense splitting.
--
-- Currency: a settlement may be paid in trip currency or trip's home currency.
-- exchange_rate is locked at creation time, mirroring expenses.exchange_rate,
-- so historical settlement records don't drift if rates fluctuate later.

create table if not exists public.settlement_payments (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references public.trips(id) on delete cascade,
    from_user_id uuid not null references public.profiles(id),
    to_user_id uuid not null references public.profiles(id),
    amount decimal(12,2) not null,
    currency text not null,
    exchange_rate decimal(12,6) not null,
    converted_amount decimal(12,2) not null,
    settled_date date not null,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    check (from_user_id <> to_user_id),
    check (amount > 0)
);

create index if not exists idx_settlement_payments_trip_id
    on public.settlement_payments(trip_id)
    where deleted_at is null;

create index if not exists idx_settlement_payments_pair
    on public.settlement_payments(trip_id, from_user_id, to_user_id)
    where deleted_at is null;

-- Per-user FK covering indexes. Needed for cascade checks (profile delete)
-- and any future cross-trip "what do I owe / what's owed to me" queries.
create index if not exists idx_settlement_payments_from_user
    on public.settlement_payments(from_user_id)
    where deleted_at is null;

create index if not exists idx_settlement_payments_to_user
    on public.settlement_payments(to_user_id)
    where deleted_at is null;

drop trigger if exists trg_set_updated_at on public.settlement_payments;
create trigger trg_set_updated_at
    before update on public.settlement_payments
    for each row execute function public.set_updated_at();

-- =========================================================
-- RLS
-- =========================================================
alter table public.settlement_payments enable row level security;

-- SELECT: any active trip member can see settlements for that trip.
drop policy if exists "settlement_payments_select_trip_member" on public.settlement_payments;
create policy "settlement_payments_select_trip_member"
    on public.settlement_payments for select
    to authenticated
    using (app_private.is_trip_member(trip_id));

-- INSERT: caller must be a trip member of trip_id. Anyone in the trip can log
-- a payment between any two members (bookkeeper UX). Both from and to must be
-- joined trip members — defensive against inviting non-members into a record.
drop policy if exists "settlement_payments_insert_member" on public.settlement_payments;
create policy "settlement_payments_insert_member"
    on public.settlement_payments for insert
    to authenticated
    with check (
        app_private.is_trip_member(trip_id)
        and exists (
            select 1 from public.trip_members m
            where m.trip_id = settlement_payments.trip_id
              and m.user_id = settlement_payments.from_user_id
              and m.joined_at is not null
        )
        and exists (
            select 1 from public.trip_members m
            where m.trip_id = settlement_payments.trip_id
              and m.user_id = settlement_payments.to_user_id
              and m.joined_at is not null
        )
    );

-- UPDATE: only the from/to user or trip owner may modify. (App code uses
-- UPDATE to set deleted_at for soft-delete-as-reverse.)
drop policy if exists "settlement_payments_update_participants" on public.settlement_payments;
create policy "settlement_payments_update_participants"
    on public.settlement_payments for update
    to authenticated
    using (
        from_user_id = (select auth.uid())
        or to_user_id = (select auth.uid())
        or exists (
            select 1 from public.trips t
            where t.id = settlement_payments.trip_id
              and t.owner_id = (select auth.uid())
        )
    )
    with check (
        from_user_id = (select auth.uid())
        or to_user_id = (select auth.uid())
        or exists (
            select 1 from public.trips t
            where t.id = settlement_payments.trip_id
              and t.owner_id = (select auth.uid())
        )
    );

-- DELETE: only the from/to user or trip owner may hard-delete. Kept consistent
-- with UPDATE; app code soft-deletes via UPDATE, so this is a defense-in-depth
-- policy in case of admin tooling or future flows.
drop policy if exists "settlement_payments_delete_participants" on public.settlement_payments;
create policy "settlement_payments_delete_participants"
    on public.settlement_payments for delete
    to authenticated
    using (
        from_user_id = (select auth.uid())
        or to_user_id = (select auth.uid())
        or exists (
            select 1 from public.trips t
            where t.id = settlement_payments.trip_id
              and t.owner_id = (select auth.uid())
        )
    );

-- =========================================================
-- Realtime: partner devices see settlements arrive instantly.
-- =========================================================
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.settlement_payments;
    end if;
exception
    when duplicate_object then null;
end $$;
