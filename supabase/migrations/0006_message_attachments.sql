-- SAFARY V1 message attachments and voice notes in private Storage.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'message-attachments','message-attachments',false,52428800,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','text/plain',
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'
  ]
)
on conflict (id) do update
set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Message owners upload attachments" on storage.objects;
create policy "Message owners upload attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id='message-attachments'
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and private.is_conversation_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Conversation members read message attachments" on storage.objects;
create policy "Conversation members read message attachments"
on storage.objects for select to authenticated
using (
  bucket_id='message-attachments'
  and exists (
    select 1 from public.message_attachments a
    where a.storage_path=name
  )
);

drop policy if exists "Message owners delete attachments" on storage.objects;
create policy "Message owners delete attachments"
on storage.objects for delete to authenticated
using (
  bucket_id='message-attachments'
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and private.is_conversation_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Message senders can add attachments" on public.message_attachments;
create policy "Message senders can add their uploaded attachments"
on public.message_attachments for insert to authenticated
with check (
  exists (
    select 1
    from public.messages m
    where m.id=message_id
      and m.sender_id=(select auth.uid())
      and private.is_conversation_member(m.conversation_id)
      and storage_path like (m.conversation_id::text || '/' || (select auth.uid())::text || '/%')
  )
  and exists (
    select 1 from storage.objects o
    where o.bucket_id='message-attachments' and o.name=storage_path
  )
);
