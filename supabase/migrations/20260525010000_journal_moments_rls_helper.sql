-- Fix journal_moments RLS to use the app_private.is_trip_member helper,
-- matching every other RLS policy in this codebase. The original migration
-- (20260525000000) inlined the membership check, which (a) missed the
-- trips.owner_id fallback that the helper provides and (b) was missing the
-- `to authenticated` role clause.

drop policy if exists "journal_moments members can read" on public.journal_moments;
create policy "journal_moments members can read"
    on public.journal_moments
    for select
    to authenticated
    using (app_private.is_trip_member(trip_id));

drop policy if exists "journal_moments members can write" on public.journal_moments;
create policy "journal_moments members can write"
    on public.journal_moments
    for all
    to authenticated
    using (app_private.is_trip_member(trip_id))
    with check (app_private.is_trip_member(trip_id));
