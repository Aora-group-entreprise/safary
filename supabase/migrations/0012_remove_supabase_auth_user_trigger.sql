drop trigger if exists on_auth_user_created on auth.users;
revoke all on function private.handle_new_user() from public,anon,authenticated;
