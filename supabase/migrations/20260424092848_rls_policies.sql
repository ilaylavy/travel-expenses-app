-- RLS policies for travel-expenses-app
-- Strategy: helper function checks if caller is a member (owner or invited) of a trip.
-- Keep the helper in a private schema so it isn't callable via the Data API.

create schema if not exists app_private;

create or replace function app_private.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.trips t
        where t.id = p_trip_id
          and (
              t.owner_id = auth.uid()
              or exists (
                  select 1
                  from public.trip_members m
                  where m.trip_id = t.id and m.user_id = auth.uid()
              )
          )
    );
$$;

revoke all on function app_private.is_trip_member(uuid) from public, anon, authenticated;
grant execute on function app_private.is_trip_member(uuid) to authenticated;

-- =========================================================
-- profiles
-- =========================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
    on public.profiles for select
    to authenticated
    using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
    on public.profiles for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
    on public.profiles for insert
    to authenticated
    with check ((select auth.uid()) = id);

-- Allow looking up basic info of other trip members (for shared trip display)
drop policy if exists "profiles_select_trip_members" on public.profiles;
create policy "profiles_select_trip_members"
    on public.profiles for select
    to authenticated
    using (
        exists (
            select 1
            from public.trip_members m1
            join public.trip_members m2 on m1.trip_id = m2.trip_id
            where m1.user_id = (select auth.uid())
              and m2.user_id = public.profiles.id
        )
    );

-- =========================================================
-- trips
-- =========================================================
alter table public.trips enable row level security;

drop policy if exists "trips_select_member" on public.trips;
create policy "trips_select_member"
    on public.trips for select
    to authenticated
    using (
        owner_id = (select auth.uid())
        or exists (
            select 1 from public.trip_members m
            where m.trip_id = public.trips.id and m.user_id = (select auth.uid())
        )
    );

drop policy if exists "trips_insert_self_owner" on public.trips;
create policy "trips_insert_self_owner"
    on public.trips for insert
    to authenticated
    with check (owner_id = (select auth.uid()));

drop policy if exists "trips_update_member" on public.trips;
create policy "trips_update_member"
    on public.trips for update
    to authenticated
    using (
        owner_id = (select auth.uid())
        or exists (
            select 1 from public.trip_members m
            where m.trip_id = public.trips.id and m.user_id = (select auth.uid())
        )
    )
    with check (
        owner_id = (select auth.uid())
        or exists (
            select 1 from public.trip_members m
            where m.trip_id = public.trips.id and m.user_id = (select auth.uid())
        )
    );

drop policy if exists "trips_delete_owner" on public.trips;
create policy "trips_delete_owner"
    on public.trips for delete
    to authenticated
    using (owner_id = (select auth.uid()));

-- =========================================================
-- trip_members
-- =========================================================
alter table public.trip_members enable row level security;

drop policy if exists "trip_members_select_member" on public.trip_members;
create policy "trip_members_select_member"
    on public.trip_members for select
    to authenticated
    using (app_private.is_trip_member(trip_id));

drop policy if exists "trip_members_insert_owner" on public.trip_members;
create policy "trip_members_insert_owner"
    on public.trip_members for insert
    to authenticated
    with check (
        exists (
            select 1 from public.trips t
            where t.id = trip_id and t.owner_id = (select auth.uid())
        )
        or user_id = (select auth.uid())  -- allow accepting own invite
    );

drop policy if exists "trip_members_update_owner" on public.trip_members;
create policy "trip_members_update_owner"
    on public.trip_members for update
    to authenticated
    using (
        exists (
            select 1 from public.trips t
            where t.id = trip_id and t.owner_id = (select auth.uid())
        )
        or user_id = (select auth.uid())
    )
    with check (
        exists (
            select 1 from public.trips t
            where t.id = trip_id and t.owner_id = (select auth.uid())
        )
        or user_id = (select auth.uid())
    );

drop policy if exists "trip_members_delete_owner_or_self" on public.trip_members;
create policy "trip_members_delete_owner_or_self"
    on public.trip_members for delete
    to authenticated
    using (
        exists (
            select 1 from public.trips t
            where t.id = trip_id and t.owner_id = (select auth.uid())
        )
        or user_id = (select auth.uid())
    );

-- =========================================================
-- categories
-- =========================================================
alter table public.categories enable row level security;

-- Global categories (trip_id is null) are readable by all authenticated users
drop policy if exists "categories_select_global_or_trip" on public.categories;
create policy "categories_select_global_or_trip"
    on public.categories for select
    to authenticated
    using (
        trip_id is null
        or app_private.is_trip_member(trip_id)
    );

drop policy if exists "categories_insert_trip_member" on public.categories;
create policy "categories_insert_trip_member"
    on public.categories for insert
    to authenticated
    with check (
        trip_id is not null
        and app_private.is_trip_member(trip_id)
    );

drop policy if exists "categories_update_trip_member" on public.categories;
create policy "categories_update_trip_member"
    on public.categories for update
    to authenticated
    using (trip_id is not null and app_private.is_trip_member(trip_id))
    with check (trip_id is not null and app_private.is_trip_member(trip_id));

drop policy if exists "categories_delete_trip_member" on public.categories;
create policy "categories_delete_trip_member"
    on public.categories for delete
    to authenticated
    using (trip_id is not null and app_private.is_trip_member(trip_id));

-- =========================================================
-- expenses
-- =========================================================
alter table public.expenses enable row level security;

drop policy if exists "expenses_select_trip_member" on public.expenses;
create policy "expenses_select_trip_member"
    on public.expenses for select
    to authenticated
    using (app_private.is_trip_member(trip_id));

drop policy if exists "expenses_insert_trip_member" on public.expenses;
create policy "expenses_insert_trip_member"
    on public.expenses for insert
    to authenticated
    with check (
        app_private.is_trip_member(trip_id)
        and user_id = (select auth.uid())
    );

drop policy if exists "expenses_update_trip_member" on public.expenses;
create policy "expenses_update_trip_member"
    on public.expenses for update
    to authenticated
    using (app_private.is_trip_member(trip_id))
    with check (app_private.is_trip_member(trip_id));

drop policy if exists "expenses_delete_trip_member" on public.expenses;
create policy "expenses_delete_trip_member"
    on public.expenses for delete
    to authenticated
    using (app_private.is_trip_member(trip_id));

-- =========================================================
-- expense_photos
-- =========================================================
alter table public.expense_photos enable row level security;

drop policy if exists "expense_photos_select_trip_member" on public.expense_photos;
create policy "expense_photos_select_trip_member"
    on public.expense_photos for select
    to authenticated
    using (
        exists (
            select 1 from public.expenses e
            where e.id = expense_id and app_private.is_trip_member(e.trip_id)
        )
    );

drop policy if exists "expense_photos_insert_trip_member" on public.expense_photos;
create policy "expense_photos_insert_trip_member"
    on public.expense_photos for insert
    to authenticated
    with check (
        exists (
            select 1 from public.expenses e
            where e.id = expense_id and app_private.is_trip_member(e.trip_id)
        )
    );

drop policy if exists "expense_photos_update_trip_member" on public.expense_photos;
create policy "expense_photos_update_trip_member"
    on public.expense_photos for update
    to authenticated
    using (
        exists (
            select 1 from public.expenses e
            where e.id = expense_id and app_private.is_trip_member(e.trip_id)
        )
    )
    with check (
        exists (
            select 1 from public.expenses e
            where e.id = expense_id and app_private.is_trip_member(e.trip_id)
        )
    );

drop policy if exists "expense_photos_delete_trip_member" on public.expense_photos;
create policy "expense_photos_delete_trip_member"
    on public.expense_photos for delete
    to authenticated
    using (
        exists (
            select 1 from public.expenses e
            where e.id = expense_id and app_private.is_trip_member(e.trip_id)
        )
    );

-- =========================================================
-- exchange_rates (shared, read-only for clients; writes via edge function/service role)
-- =========================================================
alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_select_all_auth" on public.exchange_rates;
create policy "exchange_rates_select_all_auth"
    on public.exchange_rates for select
    to authenticated
    using (true);

-- No insert/update/delete policies => only service_role (edge function) can write.
