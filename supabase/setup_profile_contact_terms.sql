-- Add contact details and terms consent to each user's Supabase profile.

alter table public.profiles
    add column if not exists phone text,
    add column if not exists terms_accepted_at timestamptz,
    add column if not exists terms_version text;

grant select, update on public.profiles to authenticated;

update public.profiles as profile
set phone = auth_user.raw_user_meta_data ->> 'phone'
from auth.users as auth_user
where auth_user.id = profile.id
  and profile.phone is null
  and auth_user.raw_user_meta_data ? 'phone';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (
        id, full_name, email, phone, terms_accepted_at, terms_version
    )
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
        case when lower(new.email) = 'govind-admin@findback.com' then 'super_admin' else 'user' end
    );

    return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
