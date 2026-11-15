-- Cover foreign-key lookups used when a user deletes their own message metadata.
-- Existing unique indexes start with message_id, so they do not efficiently
-- support cascades and filters by user_id alone.
create index if not exists message_reactions_user_id_idx
  on public.message_reactions (user_id);

create index if not exists message_user_hides_user_id_idx
  on public.message_user_hides (user_id);
