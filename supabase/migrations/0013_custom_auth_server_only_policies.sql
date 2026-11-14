create policy "Server-only account table" on public.safary_accounts for all to anon,authenticated using(false) with check(false);
create policy "Server-only session table" on public.safary_sessions for all to anon,authenticated using(false) with check(false);
create policy "Server-only login attempts table" on public.safary_login_attempts for all to anon,authenticated using(false) with check(false);
