-- Remove personal message metadata automatically when an i-tafa account is deleted.
alter table public.message_receipts
  add constraint message_receipts_user_id_fkey
  foreign key (user_id) references public.safary_accounts(id) on delete cascade;
alter table public.message_reactions
  add constraint message_reactions_user_id_fkey
  foreign key (user_id) references public.safary_accounts(id) on delete cascade;
alter table public.message_user_hides
  add constraint message_user_hides_user_id_fkey
  foreign key (user_id) references public.safary_accounts(id) on delete cascade;
