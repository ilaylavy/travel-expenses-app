-- Private Storage bucket for expense receipt photos.
-- Object key convention: <trip_id>/<expense_id>/<photo_id>.jpg
-- The first path segment is the trip_id and is what RLS keys off of via
-- the existing app_private.is_trip_member helper.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'expense-photos',
    'expense-photos',
    false,
    10485760, -- 10 MB cap; resized on-device to ~1-2 MB
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: trip members of the trip referenced by the first path segment
-- may read, write, update, and delete objects in this bucket.

drop policy if exists "expense_photos_storage_select" on storage.objects;
create policy "expense_photos_storage_select"
    on storage.objects for select
    to authenticated
    using (
        bucket_id = 'expense-photos'
        and app_private.is_trip_member(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists "expense_photos_storage_insert" on storage.objects;
create policy "expense_photos_storage_insert"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'expense-photos'
        and app_private.is_trip_member(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists "expense_photos_storage_update" on storage.objects;
create policy "expense_photos_storage_update"
    on storage.objects for update
    to authenticated
    using (
        bucket_id = 'expense-photos'
        and app_private.is_trip_member(((storage.foldername(name))[1])::uuid)
    )
    with check (
        bucket_id = 'expense-photos'
        and app_private.is_trip_member(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists "expense_photos_storage_delete" on storage.objects;
create policy "expense_photos_storage_delete"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'expense-photos'
        and app_private.is_trip_member(((storage.foldername(name))[1])::uuid)
    );
