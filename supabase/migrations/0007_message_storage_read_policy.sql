-- Permit a conversation member to read their own uploaded object before its attachment row is inserted.
drop policy if exists "Conversation members read message attachments" on storage.objects;
create policy "Conversation members read message attachments"
on storage.objects for select to authenticated
using (
  bucket_id='message-attachments'
  and (
    (
      (storage.foldername(name))[2]=(select auth.uid())::text
      and private.is_conversation_member(((storage.foldername(name))[1])::uuid)
    )
    or exists (
      select 1 from public.message_attachments a
      where a.storage_path=name
    )
  )
);
