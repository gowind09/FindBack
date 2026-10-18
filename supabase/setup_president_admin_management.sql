-- President outranks Super Admin. Both leadership roles may view the dashboard
-- and manage regular Admin accounts. The President account is bootstrapped by
-- email; regular Admins cannot grant elevated roles.
-- Only the President can grant or revoke the Super Admin rank.
alter table public.user_roles drop constraint if exists valid_role;
alter table public.user_roles add constraint valid_role
    check (role in ('user', 'admin', 'super_admin', 'president'));

create or replace function private.is_findback_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.user_roles
        where user_id = (select auth.uid())
          and role in ('admin', 'super_admin', 'president')
    );
$$;
revoke all on function private.is_findback_admin() from public, anon;
grant execute on function private.is_findback_admin() to authenticated;

-- Extend direct item and private image management policies to the President.
drop policy if exists "Admins can manage all items" on public.items;
create policy "Admins can manage all items"
    on public.items for all to authenticated
    using (exists (
        select 1 from public.user_roles
        where user_roles.user_id = (select auth.uid())
          and user_roles.role in ('admin', 'super_admin', 'president')
    ))
    with check (exists (
        select 1 from public.user_roles
        where user_roles.user_id = (select auth.uid())
          and user_roles.role in ('admin', 'super_admin', 'president')
    ));

drop policy if exists "Admins can manage all item images" on storage.objects;
create policy "Admins can manage all item images"
    on storage.objects for all to authenticated
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name, email, phone, terms_accepted_at, terms_version)
    values (
        new.id,
        new.raw_user_meta_data ->> 'full_name',
        new.email,
        new.raw_user_meta_data ->> 'phone',
        nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
        new.raw_user_meta_data ->> 'terms_version'
    );

    insert into public.user_roles (user_id, role)
    values (
        new.id,
        case
            when lower(new.email) = 'govindpandit295@gmail.com' then 'president'
            when lower(new.email) = 'govind-admin@findback.com' then 'super_admin'
            else 'user'
        end
    );
    return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
