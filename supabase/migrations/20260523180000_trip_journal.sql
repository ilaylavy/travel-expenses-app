-- Trip Journal tables.
-- Adds the per-day timeline layer: photo entries (1..N file children),
-- voice clips with server-side Whisper transcription, and per-day metadata
-- (cover override + manual location override).

----------------------------------------------------------------------
-- journal_photo_entries — one row per gallery pick.
----------------------------------------------------------------------
create table if not exists public.journal_photo_entries (
    id            uuid primary key default gen_random_uuid(),
    trip_id       uuid not null references public.trips(id) on delete cascade,
    user_id       uuid not null references public.profiles(id),
    occurred_at   timestamptz not null,
    caption       text,
    is_private    boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    deleted_at    timestamptz
);

create index if not exists idx_journal_photo_entries_trip_date
    on public.journal_photo_entries (trip_id, occurred_at)
    where deleted_at is null;

create index if not exists idx_journal_photo_entries_user
    on public.journal_photo_entries (user_id)
    where deleted_at is null;

----------------------------------------------------------------------
-- journal_photos — file children of an entry. No soft-delete: parent
-- cascade is the only way to remove.
----------------------------------------------------------------------
create table if not exists public.journal_photos (
    id              uuid primary key default gen_random_uuid(),
    entry_id        uuid not null references public.journal_photo_entries(id) on delete cascade,
    storage_path    text not null,
    local_uri       text,
    sort_order      integer not null default 0,
    exif_taken_at   timestamptz,
    created_at      timestamptz not null default now()
);

create index if not exists idx_journal_photos_entry
    on public.journal_photos (entry_id);

----------------------------------------------------------------------
-- voice_clips — single audio file per row, with Whisper transcript state.
----------------------------------------------------------------------
create table if not exists public.voice_clips (
    id                uuid primary key default gen_random_uuid(),
    trip_id           uuid not null references public.trips(id) on delete cascade,
    user_id           uuid not null references public.profiles(id),
    occurred_at       timestamptz not null,
    storage_path      text not null default '',
    local_uri         text,
    duration_sec      integer not null check (duration_sec between 1 and 300),
    transcript        text,
    transcript_status text not null default 'pending'
                       check (transcript_status in ('pending','processing','done','failed')),
    transcript_error  text,
    is_private        boolean not null default false,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    deleted_at        timestamptz
);

create index if not exists idx_voice_clips_trip_date
    on public.voice_clips (trip_id, occurred_at)
    where deleted_at is null;

create index if not exists idx_voice_clips_user
    on public.voice_clips (user_id)
    where deleted_at is null;

----------------------------------------------------------------------
-- journal_days — per-day metadata. Row exists only when the user has
-- overridden cover or set a location.
----------------------------------------------------------------------
create table if not exists public.journal_days (
    id                    uuid primary key default gen_random_uuid(),
    trip_id               uuid not null references public.trips(id) on delete cascade,
    day_date              date not null,
    location              text,
    cover_photo_entry_id  uuid references public.journal_photo_entries(id) on delete set null,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    deleted_at            timestamptz,
    unique (trip_id, day_date)
);

create index if not exists idx_journal_days_trip_date
    on public.journal_days (trip_id, day_date)
    where deleted_at is null;

----------------------------------------------------------------------
-- updated_at triggers (reuse existing public.set_updated_at)
----------------------------------------------------------------------
drop trigger if exists trg_set_updated_at on public.journal_photo_entries;
create trigger trg_set_updated_at
    before update on public.journal_photo_entries
    for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.voice_clips;
create trigger trg_set_updated_at
    before update on public.voice_clips
    for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at on public.journal_days;
create trigger trg_set_updated_at
    before update on public.journal_days
    for each row execute function public.set_updated_at();

----------------------------------------------------------------------
-- Row Level Security — trip membership for everything.
----------------------------------------------------------------------
alter table public.journal_photo_entries enable row level security;

create policy "journal_photo_entries_select"
    on public.journal_photo_entries for select
    to authenticated
    using (app_private.is_trip_member(trip_id));
create policy "journal_photo_entries_insert"
    on public.journal_photo_entries for insert
    to authenticated
    with check (app_private.is_trip_member(trip_id) and user_id = auth.uid());
create policy "journal_photo_entries_update"
    on public.journal_photo_entries for update
    to authenticated
    using (app_private.is_trip_member(trip_id))
    with check (app_private.is_trip_member(trip_id));
create policy "journal_photo_entries_delete"
    on public.journal_photo_entries for delete
    to authenticated
    using (app_private.is_trip_member(trip_id));

-- journal_photos inherits security from its parent entry; we still need
-- explicit policies on the table.
alter table public.journal_photos enable row level security;

create policy "journal_photos_select"
    on public.journal_photos for select
    to authenticated
    using (entry_id in (select id from public.journal_photo_entries
                         where app_private.is_trip_member(trip_id)));
create policy "journal_photos_insert"
    on public.journal_photos for insert
    to authenticated
    with check (entry_id in (select id from public.journal_photo_entries
                              where app_private.is_trip_member(trip_id)
                                and user_id = auth.uid()));
create policy "journal_photos_update"
    on public.journal_photos for update
    to authenticated
    using (entry_id in (select id from public.journal_photo_entries
                         where app_private.is_trip_member(trip_id)));
create policy "journal_photos_delete"
    on public.journal_photos for delete
    to authenticated
    using (entry_id in (select id from public.journal_photo_entries
                         where app_private.is_trip_member(trip_id)));

alter table public.voice_clips enable row level security;

create policy "voice_clips_select"
    on public.voice_clips for select
    to authenticated
    using (app_private.is_trip_member(trip_id));
create policy "voice_clips_insert"
    on public.voice_clips for insert
    to authenticated
    with check (app_private.is_trip_member(trip_id) and user_id = auth.uid());
create policy "voice_clips_update"
    on public.voice_clips for update
    to authenticated
    using (app_private.is_trip_member(trip_id))
    with check (app_private.is_trip_member(trip_id));
create policy "voice_clips_delete"
    on public.voice_clips for delete
    to authenticated
    using (app_private.is_trip_member(trip_id));

alter table public.journal_days enable row level security;

create policy "journal_days_select"
    on public.journal_days for select
    to authenticated
    using (app_private.is_trip_member(trip_id));
create policy "journal_days_insert"
    on public.journal_days for insert
    to authenticated
    with check (app_private.is_trip_member(trip_id));
create policy "journal_days_update"
    on public.journal_days for update
    to authenticated
    using (app_private.is_trip_member(trip_id))
    with check (app_private.is_trip_member(trip_id));
create policy "journal_days_delete"
    on public.journal_days for delete
    to authenticated
    using (app_private.is_trip_member(trip_id));

----------------------------------------------------------------------
-- Realtime publication
----------------------------------------------------------------------
alter publication supabase_realtime add table public.journal_photo_entries;
alter publication supabase_realtime add table public.journal_photos;
alter publication supabase_realtime add table public.voice_clips;
alter publication supabase_realtime add table public.journal_days;
