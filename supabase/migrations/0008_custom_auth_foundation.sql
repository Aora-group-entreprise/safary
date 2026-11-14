-- SAFARY custom authentication foundation (additive; does not yet cut over existing app traffic).
create table if not exists public.safary_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_normalized text generated always as (lower(btrim(username))) stored,
  display_name text not null,
  age smallint not null check (age between 1 and 120),
  password_hash text not null,
  password_salt text not null,
  avatar_path text not null,
  cover_path text not null,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safary_accounts_username_format check (username_normalized ~ '^[a-z0-9_.]{3,30}$'),
  constraint safary_accounts_username_unique unique (username_normalized)
);
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.safary_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.safary_accounts(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip_hash text
);
create index if not exists safary_sessions_account_idx on private.safary_sessions(account_id);
create index if not exists safary_sessions_expiry_idx on private.safary_sessions(expires_at);
create table if not exists private.safary_login_attempts (
  id bigint generated always as identity primary key,
  username_normalized text not null,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null default false
);
create index if not exists safary_login_attempts_lookup_idx on private.safary_login_attempts(username_normalized, attempted_at desc);
alter table public.safary_accounts enable row level security;
alter table private.safary_sessions enable row level security;
alter table private.safary_login_attempts enable row level security;
revoke all on public.safary_accounts from anon, authenticated;
revoke all on private.safary_sessions from anon, authenticated, public;
revoke all on private.safary_login_attempts from anon, authenticated, public;
grant all on public.safary_accounts to service_role;
grant all on private.safary_sessions to service_role;
grant all on private.safary_login_attempts to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-media','profile-media',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];
