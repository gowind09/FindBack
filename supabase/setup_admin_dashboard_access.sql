-- Allow dashboard queries to see platform data without exposing it to regular users.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

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

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
    on public.profiles for select to authenticated
    using ((select private.is_findback_admin()));

drop policy if exists "Admins can view all user roles" on public.user_roles;
create policy "Admins can view all user roles"
    on public.user_roles for select to authenticated
    using ((select private.is_findback_admin()));

drop policy if exists "Admins can view all contact messages" on public.contact_messages;
create policy "Admins can view all contact messages"
    on public.contact_messages for select to authenticated
    using ((select private.is_findback_admin()));

drop policy if exists "Users can create contact messages" on public.contact_messages;
create policy "Users can create contact messages"
    on public.contact_messages for insert to authenticated
    with check (user_id = (select auth.uid()));

drop policy if exists "Public can submit contact messages" on public.contact_messages;
create policy "Public can submit contact messages"
    on public.contact_messages for insert to anon
    with check (user_id is null);

grant delete on public.contact_messages to authenticated;
drop policy if exists "Admins can delete feedback" on public.contact_messages;
create policy "Admins can delete feedback"
    on public.contact_messages for delete to authenticated
    using ((select private.is_findback_admin()));
