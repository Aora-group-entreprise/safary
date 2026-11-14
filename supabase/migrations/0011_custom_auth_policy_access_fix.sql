grant usage on schema private to anon,authenticated,service_role;
drop policy if exists "SAFARY members read profiles" on public.profiles;
create policy "SAFARY authenticated members read profiles" on public.profiles for select to anon,authenticated
using ((select private.current_safary_user_id()) is not null);
drop policy if exists "SAFARY read own profile media" on storage.objects;
create policy "SAFARY read profile media" on storage.objects for select to anon,authenticated
using (bucket_id='profile-media' and (select private.current_safary_user_id()) is not null);
drop policy if exists "SAFARY read message media" on storage.objects;
create policy "SAFARY read message media" on storage.objects for select to anon,authenticated
using (bucket_id='message-attachments' and (
  ((storage.foldername(name))[2]=(select private.current_safary_user_id())::text
   and private.is_conversation_member(((storage.foldername(name))[1])::uuid))
  or exists(select 1 from public.message_attachments a join public.messages m on m.id=a.message_id
    where a.storage_path=name and private.is_conversation_member(m.conversation_id))
));
