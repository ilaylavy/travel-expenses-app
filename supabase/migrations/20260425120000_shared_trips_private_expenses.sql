-- Shared trips: add is_private flag on expenses and tighten expenses RLS.
--
-- is_private hides an expense from other trip members via RLS and excludes it
-- from split-balance aggregation. Update/delete are restricted to the author.

alter table public.expenses
    add column if not exists is_private boolean not null default false;

create index if not exists idx_expenses_is_private on public.expenses(is_private);

-- SELECT: members see non-private rows; author always sees their own private rows.
drop policy if exists "expenses_select_trip_member" on public.expenses;
create policy "expenses_select_trip_member"
    on public.expenses for select
    to authenticated
    using (
        app_private.is_trip_member(trip_id)
        and (is_private = false or user_id = (select auth.uid()))
    );

-- UPDATE: only the author may modify their own expense.
drop policy if exists "expenses_update_trip_member" on public.expenses;
create policy "expenses_update_trip_member"
    on public.expenses for update
    to authenticated
    using (
        app_private.is_trip_member(trip_id)
        and user_id = (select auth.uid())
    )
    with check (
        app_private.is_trip_member(trip_id)
        and user_id = (select auth.uid())
    );

-- DELETE: only the author may delete their own expense.
drop policy if exists "expenses_delete_trip_member" on public.expenses;
create policy "expenses_delete_trip_member"
    on public.expenses for delete
    to authenticated
    using (
        app_private.is_trip_member(trip_id)
        and user_id = (select auth.uid())
    );

-- =========================================================
-- Profile-by-email lookup for the invite flow.
--
-- Lives in the public schema so the edge function can reach it via PostgREST
-- rpc, but grants are restricted to service_role. Authenticated clients
-- cannot call it directly — they must go through the edge function, which
-- gates lookups on a valid JWT.
-- =========================================================
create or replace function public.profile_by_email(p_email text)
returns table (user_id uuid, name text, avatar_url text)
language sql
security definer
set search_path = public, auth
stable
as $$
    select u.id, p.name, p.avatar_url
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(p_email)
    limit 1;
$$;

revoke all on function public.profile_by_email(text) from public, anon, authenticated;
grant execute on function public.profile_by_email(text) to service_role;
