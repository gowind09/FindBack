-- Stable public tracking IDs and reporter-only resolution enforcement.
alter table public.items add column if not exists tracking_id text;
alter table public.items drop constraint if exists valid_status;
alter table public.items add constraint valid_status
    check (status in ('active', 'resolved', 'removed', 'fake'));

update public.items
set tracking_id = 'FB-' || case when item_type = 'lost' then 'LI' else 'FI' end
    || '-' || to_char(created_at::date, 'DDMMYYYY')
    || '-' || upper(substr(md5(id::text), 1, 4))
where tracking_id is null;

create unique index if not exists items_tracking_id_key on public.items (tracking_id);
alter table public.items drop constraint if exists items_tracking_id_format;
alter table public.items add constraint items_tracking_id_format
    check (
        (item_type = 'lost' and tracking_id ~ '^FB-LI-[0-9]{8}-[A-Z0-9]{4}$')
        or (item_type = 'found' and tracking_id ~ '^FB-FI-[0-9]{8}-[A-Z0-9]{4}$')
    );

create or replace function public.assign_item_tracking_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    item_prefix text;
    random_code text;
    alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    character_index integer;
begin
    item_prefix := case when new.item_type = 'lost' then 'LI' else 'FI' end;
    loop
        random_code := '';
        for character_index in 1..4 loop
            random_code := random_code || substr(alphabet, floor(random() * length(alphabet))::integer + 1, 1);
        end loop;
        new.tracking_id := 'FB-' || item_prefix || '-' || to_char(current_date, 'DDMMYYYY')
            || '-' || random_code;
        exit when not exists (
            select 1 from public.items where tracking_id = new.tracking_id
        );
    end loop;
    return new;
end;
$$;

drop trigger if exists items_assign_tracking_id on public.items;
create trigger items_assign_tracking_id
before insert on public.items
for each row execute function public.assign_item_tracking_id();

create or replace function public.enforce_reporter_only_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.status = 'resolved'
       and old.status is distinct from 'resolved'
       and old.user_id is distinct from (select auth.uid()) then
        raise exception 'Only the person who reported this item can resolve it.'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists items_reporter_only_resolution on public.items;
create trigger items_reporter_only_resolution
before update of status on public.items
for each row execute function public.enforce_reporter_only_resolution();

-- Only this verified Auth email receives the bootstrap super-admin rank.
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
