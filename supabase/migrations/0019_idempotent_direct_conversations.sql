-- Return an existing one-to-one conversation instead of creating duplicates.
create or replace function private.create_direct_conversation_impl(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select private.current_safary_user_id());
  v_conversation uuid;
  v_lock_key bigint;
begin
  if v_user is null then
    raise exception 'Session i-tafa requise' using errcode = '42501';
  end if;
  if p_other_user is null or p_other_user = v_user then
    raise exception 'Un autre membre est nécessaire' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_other_user) then
    raise exception 'Membre introuvable' using errcode = 'P0002';
  end if;

  v_lock_key := hashtextextended(
    least(v_user::text, p_other_user::text) || ':' || greatest(v_user::text, p_other_user::text),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select mine.conversation_id
    into v_conversation
  from public.conversation_members mine
  join public.conversation_members theirs
    on theirs.conversation_id = mine.conversation_id
  where mine.user_id = v_user
    and theirs.user_id = p_other_user
  group by mine.conversation_id
  having count(*) = 2
  order by mine.conversation_id
  limit 1;

  if v_conversation is not null then
    return v_conversation;
  end if;

  insert into public.conversations default values
    returning id into v_conversation;
  insert into public.conversation_members(conversation_id, user_id)
    values (v_conversation, v_user), (v_conversation, p_other_user);
  return v_conversation;
end;
$$;

revoke all on function private.create_direct_conversation_impl(uuid) from public, authenticated;
grant execute on function private.create_direct_conversation_impl(uuid) to anon, service_role;
