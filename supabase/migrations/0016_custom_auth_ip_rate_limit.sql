alter table public.safary_login_attempts add column if not exists ip_hash text;
create index if not exists safary_login_attempts_ip_lookup_idx on public.safary_login_attempts(ip_hash,attempted_at desc) where ip_hash is not null;
