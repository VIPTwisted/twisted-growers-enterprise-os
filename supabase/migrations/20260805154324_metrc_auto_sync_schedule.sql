create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname in ('metrc-delta-sync','metrc-nightly-full');
-- Delta sync every 15 minutes, around the clock - no login required
select cron.schedule(
  'metrc-delta-sync',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://fxetuqjryttnypgepsru.supabase.co/functions/v1/metrc-sync',
       headers := '{"x-admin-key": "tg-seed-8f3k2m-2026", "Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 300000
     ) $$
);
-- Nightly full reconciliation at 03:10 ET (07:10 UTC)
select cron.schedule(
  'metrc-nightly-full',
  '10 7 * * *',
  $$ select net.http_post(
       url := 'https://fxetuqjryttnypgepsru.supabase.co/functions/v1/metrc-sync?full=1',
       headers := '{"x-admin-key": "tg-seed-8f3k2m-2026", "Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 590000
     ) $$
);
select jobname, schedule from cron.job order by jobname;;
