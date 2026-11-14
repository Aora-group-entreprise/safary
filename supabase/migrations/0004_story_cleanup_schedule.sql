-- SAFARY: secure hourly Story cleanup using Vault + pg_cron + pg_net.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'safary_story_cleanup_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'safary_story_cleanup_secret',
      'Private bearer secret for the SAFARY expired-Story cleanup Edge Function'
    );
  end if;
end;
$$;

create or replace function public.get_safary_story_cleanup_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'safary_story_cleanup_secret'
  limit 1;
$$;
revoke all on function public.get_safary_story_cleanup_secret() from public, anon, authenticated;
grant execute on function public.get_safary_story_cleanup_secret() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'safary-cleanup-expired-stories'
  limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;

  perform cron.schedule(
    'safary-cleanup-expired-stories',
    '17 * * * *',
    $job$
      select net.http_post(
        url := 'https://tzznkrxnwbadgwsvlsle.supabase.co/functions/v1/cleanup-expired-stories',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'safary_story_cleanup_secret'
            limit 1
          )
        ),
        body := '{}'::jsonb
      ) as request_id;
    $job$
  );
end;
$$;
