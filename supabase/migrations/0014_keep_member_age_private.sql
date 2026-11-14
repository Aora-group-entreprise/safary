create or replace function private.handle_new_safary_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,username,display_name,avatar_url,cover_url)
 values(new.id,new.username,new.display_name,new.avatar_path,new.cover_path);
 insert into public.user_settings(user_id) values(new.id);
 return new;
end $$;
alter table public.profiles drop column if exists age;
