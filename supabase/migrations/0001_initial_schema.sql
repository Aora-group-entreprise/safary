-- SAFARY V1 database schema and baseline access control.
-- Apply this migration before 0002_story_retention.sql.
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null check(char_length(username) between 3 and 30),
 display_name text not null default '',
 avatar_url text,
 bio text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(conversation_id,user_id)
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null default '',
 message_type text not null default 'text' check(message_type in ('text','image','file','voice')),
 created_at timestamptz not null default now(),
 edited_at timestamptz,
 check(char_length(body)<=10000)
);
create table if not exists public.message_attachments (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.messages(id) on delete cascade,
 storage_path text not null,
 file_name text not null,
 mime_type text not null,
 size_bytes bigint not null check(size_bytes>0),
 created_at timestamptz not null default now()
);
create table if not exists public.stories (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique,
 media_type text not null check(media_type in ('image','video')),
 caption text not null default '',
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 check(expires_at>created_at)
);
create table if not exists public.story_views (
 story_id uuid not null references public.stories(id) on delete cascade,
 viewer_id uuid not null references auth.users(id) on delete cascade,
 viewed_at timestamptz not null default now(),
 primary key(story_id,viewer_id)
);
create table if not exists public.user_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 online_status_visible boolean not null default true,
 notifications_enabled boolean not null default true,
 updated_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at desc);
create index if not exists stories_user_created_idx on public.stories(user_id,created_at desc);
create index if not exists stories_expiry_idx on public.stories(expires_at);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);

-- Definer helper avoids querying conversation_members from its own RLS policy.
-- The caller can only test their own membership; never another user's membership.
create or replace function private.is_conversation_member(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
 select p_user_id = (select auth.uid())
   and exists (
     select 1
     from public.conversation_members cm
     where cm.conversation_id = p_conversation_id
       and cm.user_id = p_user_id
   );
$$;
revoke all on function private.is_conversation_member(uuid,uuid) from public, anon;
grant execute on function private.is_conversation_member(uuid,uuid) to authenticated;

-- Memberships are created atomically; clients cannot insert arbitrary memberships.
create or replace function public.create_direct_conversation(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_user uuid := (select auth.uid());
 v_conversation uuid;
begin
 if v_user is null then
   raise exception 'Authentication required' using errcode = '42501';
 end if;
 if p_other_user is null or p_other_user = v_user then
   raise exception 'A different recipient is required' using errcode = '22023';
 end if;
 if not exists (select 1 from public.profiles p where p.id = p_other_user) then
   raise exception 'Recipient not found' using errcode = 'P0002';
 end if;

 insert into public.conversations default values returning id into v_conversation;
 insert into public.conversation_members(conversation_id,user_id)
 values (v_conversation,v_user),(v_conversation,p_other_user);
 return v_conversation;
end;
$$;
revoke all on function public.create_direct_conversation(uuid) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.user_settings enable row level security;

create policy "Signed-in users can read public profile fields"
 on public.profiles for select to authenticated using (true);
create policy "Users can create their own profile"
 on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update their own profile"
 on public.profiles for update to authenticated
 using ((select auth.uid()) = id)
 with check ((select auth.uid()) = id);

create policy "Conversation members can read conversations"
 on public.conversations for select to authenticated
 using (private.is_conversation_member(id));
create policy "Users can read memberships in their conversations"
 on public.conversation_members for select to authenticated
 using (user_id = (select auth.uid()) or private.is_conversation_member(conversation_id));
-- No direct INSERT/UPDATE/DELETE policy on conversation_members.
-- public.create_direct_conversation() is the only client entry point.

create policy "Members can read conversation messages"
 on public.messages for select to authenticated
 using (private.is_conversation_member(conversation_id));
create policy "Members can send messages as themselves"
 on public.messages for insert to authenticated
 with check (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id));
create policy "Senders can edit their own messages"
 on public.messages for update to authenticated
 using (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id))
 with check (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id));
create policy "Senders can delete their own messages"
 on public.messages for delete to authenticated
 using (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id));

create policy "Members can read message attachments"
 on public.message_attachments for select to authenticated
 using (exists (
   select 1 from public.messages m
   where m.id = message_id and private.is_conversation_member(m.conversation_id)
 ));
create policy "Message senders can add attachments"
 on public.message_attachments for insert to authenticated
 with check (exists (
   select 1 from public.messages m
   where m.id = message_id
     and m.sender_id = (select auth.uid())
     and private.is_conversation_member(m.conversation_id)
 ));

create policy "Users can read active stories"
 on public.stories for select to authenticated
 using (expires_at > now() or user_id = (select auth.uid()));
create policy "Users can publish stories to their own storage folder"
 on public.stories for insert to authenticated
 with check (
   user_id = (select auth.uid())
   and (storage_path like ((select auth.uid())::text || '/%'))
   and exists (
     select 1 from storage.objects o
     where o.bucket_id = 'stories' and o.name = storage_path
   )
 );
create policy "Users can delete their own stories"
 on public.stories for delete to authenticated
 using (user_id = (select auth.uid()));

create policy "Users can read their own views or views of their stories"
 on public.story_views for select to authenticated
 using (
   viewer_id = (select auth.uid())
   or exists (select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid()))
 );
create policy "Users can record views of active stories"
 on public.story_views for insert to authenticated
 with check (
   viewer_id = (select auth.uid())
   and exists (select 1 from public.stories s where s.id = story_id and s.expires_at > now())
 );

create policy "Users can read their settings"
 on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "Users can create their settings"
 on public.user_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users can update their settings"
 on public.user_settings for update to authenticated
 using (user_id = (select auth.uid()))
 with check (user_id = (select auth.uid()));

-- Explicit Data API grants are required on current Supabase projects.
grant select, insert, update on public.profiles to authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert on public.message_attachments to authenticated;
grant select, insert, delete on public.stories to authenticated;
grant select, insert on public.story_views to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant all on all tables in schema public to service_role;

-- Create a minimal public profile and private settings row for each new Auth user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_username text;
 v_requested_username text;
begin
 v_requested_username := lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
 if v_requested_username ~ '^[a-z0-9_.]{3,30}$'
    and not exists (select 1 from public.profiles p where p.username = v_requested_username) then
   v_username := v_requested_username;
 else
   v_username := 'user_' || substr(new.id::text,1,8);
 end if;

 insert into public.profiles(id,username,display_name)
 values (
   new.id,
   v_username,
   left(coalesce(new.raw_user_meta_data->>'display_name',''),60)
 );
 insert into public.user_settings(user_id) values (new.id);
 return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
 after insert on auth.users
 for each row execute function private.handle_new_user();

do $$
begin
 alter publication supabase_realtime add table public.messages;
exception when duplicate_object then
 null;
end;
$$;