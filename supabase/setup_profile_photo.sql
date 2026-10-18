-- Store a private Supabase Storage object path for each user's optional avatar.
alter table public.profiles
    add column if not exists avatar_path text;

grant select, update on public.profiles to authenticated;
