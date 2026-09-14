-- Caught by the registry within ten minutes of shipping (14 Sep 03:05–03:10 UTC): the sync watcher's own cron
-- run failed — ai_bridge_jobs.status allows pending | running | done | error, and both watchers queued jobs as
-- 'queued'. And f_sync_status reported cron failures as the raw word 'failed' (its health case only mapped
-- 'error' to 'failing'), which the watcher did not treat as red. Three fixes, no new vocabulary:
-- 1. jobs are queued as 'pending' (the bridge's own word); 2. health maps error | failed | failure to 'failing';
-- 3. the watcher treats 'failing', 'stale', 'never ran', 'missing secret' and 'partial' as red.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.f_deploy_watch()'::regprocedure);
  src := replace(src, $q$'rule', 'BP-16-3'), 'queued')$q$, $q$'rule', 'BP-16-3'), 'pending')$q$);
  execute src;
  src := pg_get_functiondef('public.f_sync_watch()'::regprocedure);
  src := replace(src, $q$'rule', 'BP-16-4'), 'queued')$q$, $q$'rule', 'BP-16-4'), 'pending')$q$);
  src := replace(src, $q$s.health in ('failing', 'stale', 'missing secret', 'never ran')$q$, $q$s.health in ('failing', 'stale', 'missing secret', 'never ran', 'partial')$q$);
  execute src;
  src := pg_get_functiondef('public.f_sync_status()'::regprocedure);
  src := replace(src, $q$when l.last_status = 'error' then 'failing'$q$, $q$when l.last_status in ('error', 'failed', 'failure') then 'failing'$q$);
  if src not like $q$%('error', 'failed', 'failure')%$q$ then raise exception 'health rule not patched'; end if;
  execute src;
end $$;
select public.f_sync_watch();;
