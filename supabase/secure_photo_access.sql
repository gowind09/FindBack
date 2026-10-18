-- Limit photo reads to visible item reports, the viewer's own profile photo,
-- and the existing administrator policy. This does not change upload/delete rules.
begin;

drop policy if exists "Authenticated users can view item images" on storage.objects;
drop policy if exists "Users can view photos for visible reports and own profile" on storage.objects;

create policy "Users can view photos for visible reports and own profile"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'item-images'
        and (
            exists (
                select 1
                from public.items as item
                where item.image_url = storage.objects.name
            )
            or (
                (storage.foldername(storage.objects.name))[1] = (select auth.uid()::text)
                and (storage.foldername(storage.objects.name))[2] = 'profile'
            )
        )
    );

commit;
