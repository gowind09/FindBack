-- Private report chats. Apply after setup_admin_dashboard_access.sql so the
-- existing private schema and elevated-role policies are available.

-- Report contact fields are no longer needed: remove broad table-level reads
-- and allow only the non-contact columns the public FindBack app uses.
revoke select on public.items from public, anon, authenticated;
grant select (
    id, tracking_id, item_type, item_name, category, location, item_date,
    description, image_url, status, created_at, user_id
) on public.items to authenticated;

create or replace function private.is_findback_chat_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.user_roles
        where user_id = (select auth.uid())
          and role in ('super_admin', 'president')
    );
$$;
revoke all on function private.is_findback_chat_admin() from public, anon;
grant execute on function private.is_findback_chat_admin() to authenticated;

create table if not exists public.item_chats (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null references public.items(id) on delete cascade,
    related_item_id uuid references public.items(id) on delete set null,
    reporter_id uuid not null references auth.users(id) on delete cascade,
    participant_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint item_chats_distinct_participants check (reporter_id <> participant_id),
    constraint item_chats_one_conversation_per_item_and_participant unique (item_id, participant_id)
);

alter table public.item_chats
    add column if not exists related_item_id uuid references public.items(id) on delete set null;

alter table public.item_chats
    add column if not exists reporter_name text,
    add column if not exists participant_name text;

create or replace function private.set_item_chat_display_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    select coalesce((select profile.full_name from public.profiles profile where profile.id = new.reporter_id), 'FindBack user')
    into new.reporter_name;
    select coalesce((select profile.full_name from public.profiles profile where profile.id = new.participant_id), 'FindBack user')
    into new.participant_name;
    return new;
end;
$$;
revoke all on function private.set_item_chat_display_names() from public, anon, authenticated;

drop trigger if exists item_chats_set_display_names on public.item_chats;
create trigger item_chats_set_display_names
before insert on public.item_chats
for each row execute function private.set_item_chat_display_names();

update public.item_chats chat
set reporter_name = coalesce(reporter.full_name, 'FindBack user'),
    participant_name = coalesce(participant.full_name, 'FindBack user')
from public.profiles reporter, public.profiles participant
where reporter.id = chat.reporter_id and participant.id = chat.participant_id
  and (chat.reporter_name is null or chat.participant_name is null);

create table if not exists public.item_chat_messages (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid not null references public.item_chats(id) on delete cascade,
    sender_id uuid not null references auth.users(id) on delete cascade,
    body text,
    attachment_path text,
    attachment_name text,
    attachment_mime_type text,
    attachment_size bigint,
    created_at timestamptz not null default now()
);

alter table public.item_chat_messages alter column body drop not null;
alter table public.item_chat_messages add column if not exists attachment_path text;
alter table public.item_chat_messages add column if not exists attachment_name text;
alter table public.item_chat_messages add column if not exists attachment_mime_type text;
alter table public.item_chat_messages add column if not exists attachment_size bigint;
alter table public.item_chat_messages drop constraint if exists item_chat_messages_body_check;
alter table public.item_chat_messages drop constraint if exists item_chat_messages_body_or_attachment_check;
alter table public.item_chat_messages add constraint item_chat_messages_body_or_attachment_check
    check (
        (body is not null and char_length(body) between 1 and 4000)
        or attachment_path is not null
    );

create index if not exists item_chat_messages_chat_created_idx
    on public.item_chat_messages (chat_id, created_at);
create index if not exists item_chats_reporter_created_idx
    on public.item_chats (reporter_id, created_at desc);
create index if not exists item_chats_participant_created_idx
    on public.item_chats (participant_id, created_at desc);
create index if not exists item_chats_related_item_idx
    on public.item_chats (related_item_id);

alter table public.item_chats enable row level security;
alter table public.item_chat_messages enable row level security;
revoke all on public.item_chats, public.item_chat_messages from public, anon, authenticated;
grant select, insert on public.item_chats to authenticated;
grant select, insert on public.item_chat_messages to authenticated;

drop policy if exists "Chat participants and senior admins can view chats" on public.item_chats;
create policy "Chat participants and senior admins can view chats"
    on public.item_chats for select to authenticated
    using (
        reporter_id = (select auth.uid())
        or participant_id = (select auth.uid())
        or (select private.is_findback_chat_admin())
    );

drop policy if exists "Users can start a chat with a report's reporter" on public.item_chats;
create policy "Users can start a chat with a report's reporter"
    on public.item_chats for insert to authenticated
    with check (
        participant_id = (select auth.uid())
        and reporter_id <> (select auth.uid())
        and exists (
            select 1 from public.items
            where items.id = item_id and items.user_id = reporter_id
        )
        and (
            related_item_id is null
            or exists (
                select 1 from public.items related_item
                where related_item.id = related_item_id
                  and related_item.user_id = (select auth.uid())
                  and related_item.item_type <> (select target_item.item_type from public.items target_item where target_item.id = item_id)
            )
        )
    );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'chat-attachments', 'chat-attachments', false, 15728640,
    array[
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip',
        'video/mp4', 'audio/mpeg', 'audio/mp4', 'audio/ogg'
    ]
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select, insert, delete on storage.objects to authenticated;

drop policy if exists "Chat participants can upload attachments" on storage.objects;
create policy "Chat participants can upload attachments"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[2] = (select auth.uid())::text
        and exists (
            select 1 from public.item_chats chat
            where chat.id::text = (storage.foldername(name))[1]
              and (chat.reporter_id = (select auth.uid()) or chat.participant_id = (select auth.uid()))
        )
    );

drop policy if exists "Chat participants and senior admins can view attachments" on storage.objects;
create policy "Chat participants and senior admins can view attachments"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'chat-attachments'
        and (
            exists (
                select 1 from public.item_chats chat
                where chat.id::text = (storage.foldername(name))[1]
                  and (chat.reporter_id = (select auth.uid()) or chat.participant_id = (select auth.uid()))
            )
            or (select private.is_findback_chat_admin())
        )
    );

drop policy if exists "Users can delete their own chat attachments" on storage.objects;
create policy "Users can delete their own chat attachments"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[2] = (select auth.uid())::text
        and exists (
            select 1 from public.item_chats chat
            where chat.id::text = (storage.foldername(name))[1]
              and (chat.reporter_id = (select auth.uid()) or chat.participant_id = (select auth.uid()))
        )
    );

drop policy if exists "Chat participants and senior admins can view messages" on public.item_chat_messages;
create policy "Chat participants and senior admins can view messages"
    on public.item_chat_messages for select to authenticated
    using (
        exists (
            select 1 from public.item_chats chat
            where chat.id = chat_id
              and (chat.reporter_id = (select auth.uid())
                   or chat.participant_id = (select auth.uid()))
        )
        or (select private.is_findback_chat_admin())
    );

drop policy if exists "Chat participants can send messages" on public.item_chat_messages;
create policy "Chat participants can send messages"
    on public.item_chat_messages for insert to authenticated
    with check (
        sender_id = (select auth.uid())
        and exists (
            select 1 from public.item_chats chat
            where chat.id = chat_id
              and (chat.reporter_id = (select auth.uid())
                   or chat.participant_id = (select auth.uid()))
        )
        and (
            attachment_path is null
            or (
                (storage.foldername(attachment_path))[1] = chat_id::text
                and (storage.foldername(attachment_path))[2] = (select auth.uid())::text
            )
        )
    );
