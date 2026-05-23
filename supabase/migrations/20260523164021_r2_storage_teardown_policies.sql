-- R2 photo storage teardown (part 1 of 2).
-- Drops the legacy Supabase Storage RLS policies for the expense-photos
-- bucket. Bucket and object cleanup happens via the Supabase dashboard
-- (the storage.protect_delete trigger blocks direct SQL deletes against
-- storage tables — the dashboard / Storage API is the proper path).

drop policy if exists "expense_photos_storage_select" on storage.objects;
drop policy if exists "expense_photos_storage_insert" on storage.objects;
drop policy if exists "expense_photos_storage_update" on storage.objects;
drop policy if exists "expense_photos_storage_delete" on storage.objects;
