-- Restores the prior signed-in access policy. This re-allows any authenticated
-- user to read every item-images object, so use only to roll back this migration.
begin;

drop policy if exists "Users can view photos for visible reports and own profile" on storage.objects;
drop policy if exists "Authenticated users can view item images" on storage.objects;

create policy "Authenticated users can view item images"
    on storage.objects
    for select
    to authenticated
    using (bucket_id = 'item-images');

commit;
