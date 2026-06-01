-- Journal redesign — shared Moments + per-trip cover photo.
-- - Adds journal_moments table (user-curated groupings of journal entries).
-- - Adds nullable moment_id FK to journal_photo_entries, voice_clips, expenses.
-- - Adds cover_photo_storage_path to trips (for the All Days hero banner).
--
-- Additive only — does NOT touch the existing per-user SELECT RLS on
-- journal_photo_entries / voice_clips. That policy flip is deferred to
-- Task 12.3 so the currently-deployed app keeps its private-by-default
-- behavior until the shared-journal UI ships.
--
-- Note: journal_moments.cover_photo_entry_id is intentionally stored without
-- a FK constraint so the sync engine can insert a Moment whose cover photo
-- entry hasn't been pushed yet (avoids a circular dependency with
-- journal_photo_entries.moment_id). App-level integrity: if the entry is
-- missing locally, the UI falls back to the gradient placeholder.

------------------------------------------------------------------
-- journal_moments
------------------------------------------------------------------
create table if not exists public.journal_moments (
    id                    uuid primary key default gen_random_uuid(),
    trip_id               uuid not null references public.trips(id) on delete cascade,
    day_date              date not null,
    title                 text,
    cover_photo_entry_id  uuid,
    created_by            uuid not null references public.profiles(id),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    deleted_at            timestamptz
);

create index if not exists idx_journal_moments_trip_day
    on public.journal_moments (trip_id, day_date)
    where deleted_at is null;

drop trigger if exists trg_set_updated_at on public.journal_moments;
create trigger trg_set_updated_at
    before update on public.journal_moments
    for each row execute function public.set_updated_at();

------------------------------------------------------------------
-- moment_id FKs on the three entry types
------------------------------------------------------------------
alter table public.journal_photo_entries
    add column if not exists moment_id uuid
        references public.journal_moments(id) on delete set null;
alter table public.voice_clips
    add column if not exists moment_id uuid
        references public.journal_moments(id) on delete set null;
alter table public.expenses
    add column if not exists moment_id uuid
        references public.journal_moments(id) on delete set null;

create index if not exists idx_journal_photo_entries_moment
    on public.journal_photo_entries (moment_id)
    where deleted_at is null and moment_id is not null;
create index if not exists idx_voice_clips_moment
    on public.voice_clips (moment_id)
    where deleted_at is null and moment_id is not null;
create index if not exists idx_expenses_moment
    on public.expenses (moment_id)
    where deleted_at is null and moment_id is not null;

------------------------------------------------------------------
-- trips.cover_photo_storage_path (All Days hero)
------------------------------------------------------------------
alter table public.trips
    add column if not exists cover_photo_storage_path text;

------------------------------------------------------------------
-- RLS for journal_moments — mirror existing journal_photo_entries policy:
-- any member of the trip can SELECT/INSERT/UPDATE/DELETE.
------------------------------------------------------------------
alter table public.journal_moments enable row level security;

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

------------------------------------------------------------------
-- Realtime publication: add the new table.
------------------------------------------------------------------
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.journal_moments;
    end if;
exception
    when duplicate_object then null;
end $$;
