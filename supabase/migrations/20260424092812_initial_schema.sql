-- Initial schema for travel-expenses-app
-- Tables: profiles, trips, trip_members, categories, expenses, expense_photos, exchange_rates

-- =========================================================
-- profiles (extends auth.users)
-- =========================================================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    avatar_url text,
    default_currency text not null default 'USD',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public user profile data. One row per auth user.';

-- =========================================================
-- trips
-- =========================================================
create table if not exists public.trips (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    emoji text not null default '✈️',
    start_date date not null,
    end_date date,
    base_currency text not null,
    home_currency text not null,
    budget decimal(12,2),
    owner_id uuid not null references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

-- =========================================================
-- trip_members
-- =========================================================
create table if not exists public.trip_members (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references public.trips(id) on delete cascade,
    user_id uuid not null references public.profiles(id),
    role text not null check (role in ('owner', 'member')),
    invited_at timestamptz not null default now(),
    joined_at timestamptz,
    unique (trip_id, user_id)
);

-- =========================================================
-- categories (global defaults when trip_id is null, custom when set)
-- =========================================================
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    emoji text not null,
    color text not null,
    sort_order integer not null default 0,
    trip_id uuid references public.trips(id) on delete cascade,
    created_by uuid references public.profiles(id),
    is_archived boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- =========================================================
-- expenses
-- =========================================================
create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references public.trips(id) on delete cascade,
    user_id uuid not null references public.profiles(id),
    amount decimal(12,2) not null,
    currency text not null,
    converted_amount decimal(12,2) not null,
    exchange_rate decimal(12,6) not null,
    category_id uuid not null references public.categories(id),
    note text,
    payment_method text,
    latitude double precision,
    longitude double precision,
    place_name text,
    expense_date date not null,
    expense_time time not null,
    is_refund boolean not null default false,
    is_excluded_from_metrics boolean not null default false,
    spread_start_date date,
    spread_end_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

-- =========================================================
-- expense_photos
-- =========================================================
create table if not exists public.expense_photos (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.expenses(id) on delete cascade,
    storage_path text not null,
    local_uri text,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

-- =========================================================
-- exchange_rates (shared cache; one row per (base, target, date))
-- =========================================================
create table if not exists public.exchange_rates (
    id uuid primary key default gen_random_uuid(),
    base_currency text not null,
    target_currency text not null,
    rate decimal(12,6) not null,
    fetched_date date not null,
    created_at timestamptz not null default now(),
    unique (base_currency, target_currency, fetched_date)
);

-- =========================================================
-- Indexes
-- =========================================================
create index if not exists idx_expenses_trip_id on public.expenses(trip_id);
create index if not exists idx_expenses_category_id on public.expenses(category_id);
create index if not exists idx_expenses_date on public.expenses(expense_date);
create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_trip_members_trip_id on public.trip_members(trip_id);
create index if not exists idx_trip_members_user_id on public.trip_members(user_id);
create index if not exists idx_categories_trip_id on public.categories(trip_id);
create index if not exists idx_expense_photos_expense_id on public.expense_photos(expense_id);
create index if not exists idx_exchange_rates_lookup on public.exchange_rates(base_currency, target_currency, fetched_date);

-- =========================================================
-- updated_at trigger
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
declare
    t text;
begin
    foreach t in array array['profiles', 'trips', 'categories', 'expenses']
    loop
        execute format(
            'drop trigger if exists trg_set_updated_at on public.%I;
             create trigger trg_set_updated_at
             before update on public.%I
             for each row execute function public.set_updated_at();',
            t, t
        );
    end loop;
end $$;

-- =========================================================
-- Auto-create profile on auth.users insert
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, name, default_currency)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
        'USD'
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================
-- Owner auto-membership: when a trip is created, add owner to trip_members
-- =========================================================
create or replace function public.add_owner_to_trip_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.trip_members (trip_id, user_id, role, joined_at)
    values (new.id, new.owner_id, 'owner', now())
    on conflict (trip_id, user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists trg_trips_add_owner on public.trips;
create trigger trg_trips_add_owner
after insert on public.trips
for each row execute function public.add_owner_to_trip_members();

-- =========================================================
-- Realtime: add trip and expense tables to supabase_realtime publication
-- =========================================================
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.trips;
        alter publication supabase_realtime add table public.trip_members;
        alter publication supabase_realtime add table public.expenses;
        alter publication supabase_realtime add table public.expense_photos;
        alter publication supabase_realtime add table public.categories;
    end if;
exception
    when duplicate_object then null;
end $$;
