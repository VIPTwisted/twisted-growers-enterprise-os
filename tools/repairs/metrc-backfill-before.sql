-- Exact previously committed controller definition. Restore only with its schedule paused.
CREATE OR REPLACE FUNCTION public.tg_metrc_backfill_next()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w metrc_backfill_window; req bigint; inflight int;
begin
  -- Close out the window the last run belonged to, using that run's own outcome.
  update metrc_backfill_window b
     set status = case when r.status in ('ok','partial') then 'done' else 'failed' end,
         records = r.records, finished_at = r.finished_at,
         note = coalesce(r.error, 'closed from run '||r.id)
    from metrc_sync_runs r
   where b.sync_run_id = r.id and b.status = 'running' and r.finished_at is not null;

  select * into w from metrc_backfill_window
   where status = 'pending' and attempts < 3
   order by win_start limit 1;

  if not found then
    return 'nothing pending - backfill complete or exhausted';
  end if;

  -- Never overlap, and check the endpoint we are ACTUALLY about to fire. The previous
  -- version hardcoded 'plants%' and would have let a packages run overlap silently.
  select count(*) into inflight from metrc_sync_runs
   where status = 'running' and endpoint like w.endpoint||'%'
     and started_at > now() - interval '10 minutes';
  if inflight > 0 then
    return 'waiting - a '||w.endpoint||' sync is still in flight';
  end if;

  select tg_call_function(
    'metrc-sync?endpoints='||w.endpoint||'&license='||w.licence
    ||'&winStart='||to_char(w.win_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ||'&winEnd='  ||to_char(w.win_end   at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ) into req;

  update metrc_backfill_window
     set status='running', attempted_at=now(), attempts=attempts+1,
         sync_run_id=(select max(id) from metrc_sync_runs where endpoint like w.endpoint||'%')
   where id=w.id;

  return format('fired %s %s %s to %s (request %s)', w.endpoint, w.licence,
                w.win_start::date, w.win_end::date, req);
end $function$;
