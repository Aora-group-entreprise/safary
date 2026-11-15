-- SAFARY Messenger-style read receipts.
create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_receipts_user_read_idx
  on public.message_receipts(user_id, read_at desc);
alter table public.message_receipts enable row level security;
drop policy if exists "SAFARY members read message receipts" on public.message_receipts;
create policy "SAFARY members read message receipts"
  on public.message_receipts for select
  using (exists (
    select 1 from public.messages m
    where m.id = message_receipts.message_id
      and private.is_conversation_member(m.conversation_id)
  ));
drop policy if exists "SAFARY users create own read receipts" on public.message_receipts;
create policy "SAFARY users create own read receipts"
  on public.message_receipts for insert
  with check (
    user_id = (select private.current_safary_user_id())
    and exists (
      select 1 from public.messages m
      where m.id = message_receipts.message_id
        and m.sender_id <> user_id
        and private.is_conversation_member(m.conversation_id)
    )
  );
