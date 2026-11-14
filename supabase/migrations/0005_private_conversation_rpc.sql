-- Keep the privileged membership write behind a non-exposed schema.
create or replace function private.create_direct_conversation_impl(p_other_user uuid)
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
revoke all on function private.create_direct_conversation_impl(uuid) from public, anon;
grant execute on function private.create_direct_conversation_impl(uuid) to authenticated;

create or replace function public.create_direct_conversation(p_other_user uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_direct_conversation_impl(p_other_user);
$$;
revoke all on function public.create_direct_conversation(uuid) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
