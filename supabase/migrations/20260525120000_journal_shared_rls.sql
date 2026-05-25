-- Journal redesign — Phase 12.3 (deferred): drop per-user SELECT gate
-- on journal_photo_entries and voice_clips. The new client-side filter
-- (built in Phase 5-11) is already shared-by-trip — once the new UI is
-- in users' hands via an OTA update, this migration flips the SQL so
-- partners on a shared trip can finally SEE each other's entries.
--
-- IMPORTANT — DO NOT apply this until:
--   1. Phase 1-12.2 is shipped to all users via `eas update`.
--   2. The new shared-journal UI is confirmed live in client logs.
-- Applying earlier would expose other users' entries to the still-
-- deployed pre-redesign app, which has no per-user client-side filter
-- (the server gate was the only thing keeping entries private).
--
-- Until then this file stays in the repo as a record of the planned
-- change but is NOT pushed to the live project.

begin;

-- journal_photo_entries: replace per-user SELECT with trip-member SELECT.
drop policy if exists "journal_photo_entries_select_own"
  on public.journal_photo_entries;

create policy "journal_photo_entries_select_trip_member"
  on public.journal_photo_entries
  for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- voice_clips: same flip — trip members see all clips for trips they belong to.
drop policy if exists "voice_clips_select_own"
  on public.voice_clips;

create policy "voice_clips_select_trip_member"
  on public.voice_clips
  for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- INSERT / UPDATE / DELETE policies stay as they are — those already allow
-- any trip member to write (the journal has been "anyone can write, only
-- author can read" until this migration).

commit;
