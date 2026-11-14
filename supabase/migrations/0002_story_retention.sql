-- SAFARY Stories: fixed 48-hour lifetime and private media access.
create or replace function public.enforce_story_48h_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
 new.created_at := coalesce(new.created_at, now());
 new.expires_at := new.created_at + interval '48 hours';
 return new;
end;
$$;
revoke all on function public.enforce_story_48h_expiry() from public, anon, authenticated;
drop trigger if exists stories_enforce_48h on public.stories;
create trigger stories_enforce_48h
 before insert on public.stories
 for each row execute function public.enforce_story_48h_expiry();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
 'stories','stories',false,52428800,
 array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Story owners upload to own folder" on storage.objects;
create policy "Story owners upload to own folder"
 on storage.objects for insert to authenticated
 with check (
   bucket_id = 'stories'
   and (storage.foldername(name))[1] = (select auth.uid())::text
 );

drop policy if exists "Authenticated members read story media" on storage.objects;
create policy "Only active story media is readable"
 on storage.objects for select to authenticated
 using (
   bucket_id = 'stories'
   and exists (
     select 1 from public.stories s
     where s.storage_path = name
       and (s.expires_at > now() or s.user_id = (select auth.uid()))
   )
 );

drop policy if exists "Story owners delete own media" on storage.objects;
create policy "Story owners delete own media"
 on storage.objects for delete to authenticated
 using (
   bucket_id = 'stories'
   and (storage.foldername(name))[1] = (select auth.uid())::text
 );

-- Called only by the cleanup Edge Function using the service_role key.
create or replace function public.expired_story_objects()
returns table(story_id uuid, storage_path text)
language sql
security definer
set search_path = ''
as $$
 select s.id, s.storage_path
 from public.stories s
 where s.expires_at <= now();
$$;
revoke all on function public.expired_story_objects() from public, anon, authenticated;
grant execute on function public.expired_story_objects() to service_role;