-- Per-user trip budgets.
--
-- Move budget off the trips table (where it was a single shared figure) onto
-- trip_members so each member can keep their own personal budget. The trips
-- table keeps its budget column for now to avoid breaking in-flight sync
-- payloads from older clients; new code reads/writes the per-member column.
--
-- The legacy trips.budget value is interpreted as already being in the trip's
-- home_currency (the new contract). It migrates onto the owner's row only —
-- members who later want their own budget set it via Edit Trip.

alter table public.trip_members
    add column if not exists budget decimal(12,2),
    add column if not exists updated_at timestamptz not null default now();

-- Set up the updated_at trigger so realtime UPDATE events flow when a member
-- changes their budget. trip_members previously had no trigger because the
-- table was treated as near-immutable.
drop trigger if exists trg_set_updated_at on public.trip_members;
create trigger trg_set_updated_at
before update on public.trip_members
for each row execute function public.set_updated_at();

-- Migrate existing trip-level budgets onto the owner row.
update public.trip_members tm
set budget = t.budget
from public.trips t
where tm.trip_id = t.id
  and tm.role = 'owner'
  and t.budget is not null
  and tm.budget is null;
