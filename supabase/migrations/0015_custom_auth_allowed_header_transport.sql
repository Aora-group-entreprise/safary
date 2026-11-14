create or replace function private.current_safary_user_id()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_header text; v_token text; v_user uuid;
begin
 begin v_header := current_setting('request.headers',true)::json ->> 'x-client-info';
 exception when others then return null; end;
 if v_header is null or not starts_with(v_header,'safary-session:') then return null; end if;
 v_token := substring(v_header from length('safary-session:')+1);
 if length(v_token)<>64 or v_token !~ '^[0-9a-f]{64}$' then return null; end if;
 select s.account_id into v_user from public.safary_sessions s
 where s.token_hash=encode(extensions.digest(v_token,'sha256'),'hex')
 and s.revoked_at is null and s.expires_at>now() limit 1;
 return v_user;
end $$;
