-- Keep server-only auth tables in the Data API schema so the Edge Function's service-role client can reach them.
-- RLS remains enabled and all client-role privileges remain revoked.
alter table private.safary_sessions set schema public;
alter table private.safary_login_attempts set schema public;
revoke all on public.safary_sessions from public, anon, authenticated;
revoke all on public.safary_login_attempts from public, anon, authenticated;
grant all on public.safary_sessions to service_role;
grant all on public.safary_login_attempts to service_role;
