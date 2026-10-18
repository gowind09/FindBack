-- FindBack lost/found reports and private item photo storage.
-- Safe to run repeatedly; existing reports are retained.

grant select, insert, update, delete on public.items to authenticated;
alter table public.items enable row level security;

drop policy if exists "Admins can manage all items" on public.items;
create policy "Admins can manage all items"
    on public.items
    for all
    to authenticated
    using (
        exists (
            select 1 from public.user_roles
            where user_roles.user_id = (select auth.uid())
              and user_roles.role in ('admin', 'super_admin', 'president')
        )
    )
    with check (
        exists (
            select 1 from public.user_roles
            where user_roles.user_id = (select auth.uid())
              and user_roles.role in ('admin', 'super_admin', 'president')
        )
    );

-- Report owners can see and manage only their own reports. Admin access above
-- remains additive through PostgreSQL's permissive policy behavior.
drop policy if exists "Users can view items" on public.items;
create policy "Users can view items"
    on public.items for select to authenticated using (true);

drop policy if exists "Users can create own items" on public.items;
create policy "Users can create own items"
    on public.items for insert to authenticated
    with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own items" on public.items;
create policy "Users can update own items"
    on public.items for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own items" on public.items;
create policy "Users can delete own items"
    on public.items for delete to authenticated
    using (user_id = (select auth.uid()));

-- Photos are private and limited to common web image formats and 5 MB.
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'item-images';

grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists "Authenticated users can upload item images" on storage.objects;
create policy "Authenticated users can upload item images"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'item-images'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );

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
                select 1 from public.items as item
                where item.image_url = storage.objects.name
            )
            or (
                (storage.foldername(storage.objects.name))[1] = (select auth.uid()::text)
                and (storage.foldername(storage.objects.name))[2] = 'profile'
            )
        )
    );

drop policy if exists "Users can delete item images" on storage.objects;
create policy "Users can delete item images"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'item-images'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );

drop policy if exists "Users can update item images" on storage.objects;
create policy "Users can update item images"
    on storage.objects
    for update
    to authenticated
    using (
        bucket_id = 'item-images'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    )
    with check (
        bucket_id = 'item-images'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );

drop policy if exists "Admins can manage all item images" on storage.objects;
create policy "Admins can manage all item images"
    on storage.objects
    for all
    to authenticated
    using (
        bucket_id = 'item-images'
        and exists (
            select 1 from public.user_roles
            where user_roles.user_id = (select auth.uid())
              and user_roles.role in ('admin', 'super_admin', 'president')
        )
    )
    with check (
        bucket_id = 'item-images'
        and exists (
            select 1 from public.user_roles
            where user_roles.user_id = (select auth.uid())
              and user_roles.role in ('admin', 'super_admin', 'president')
        )
    );
