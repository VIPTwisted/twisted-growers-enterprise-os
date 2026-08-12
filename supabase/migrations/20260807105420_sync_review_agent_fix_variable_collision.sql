/* Fix: the local variable run_id collided with watchdog_findings.run_id in the
   final count. Renamed to v_run_id. */

create or replace function tg_sync_review()
returns table (raised text, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare rec record; v_run_id bigint;
begin
  insert into watchdog_runs (ran_at, ran_by, notes)
  values (now(), 'tg_sync_review', 'automated review of sync health')
  returning id into v_run_id;

  for rec in
    select endpoint, license, count(*) att,
           count(*) filter (where status='error') err,
           max(left(error,160)) last_err
    from metrc_sync_runs
    where started_at > now() - interval '24 hours'
    group by 1,2
    having count(*) filter (where status='error')::numeric / nullif(count(*),0) > 0.2
  loop
    insert into watchdog_findings
      (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
       when_it_started, why_it_matters, how_it_was_detected, what_to_do, the_arithmetic)
    values (v_run_id, 'sync-failing:'||rec.endpoint||':'||coalesce(rec.license,'-'),
      case when rec.err = rec.att then 'critical' else 'elevated' end,
      'Sync "'||rec.endpoint||'" is failing on licence '||coalesce(rec.license,'?'),
      'Metrc sync · '||rec.endpoint, 'Vincent',
      (select min(started_at)::text from metrc_sync_runs m
        where m.endpoint=rec.endpoint and m.status='error'),
      case when rec.err = rec.att
        then 'Every single run failed. Whatever this endpoint feeds is stale or empty, and no page will say so.'
        else 'Partial failure means the data is incomplete in ways nothing else will reveal.' end,
      'Reviewed metrc_sync_runs over the last 24 hours and compared errors to attempts.',
      case when rec.last_err ilike '%401%'
        then 'Metrc is refusing the credentials. Check the API key is authorised for this licence AND this endpoint - Metrc permissions are per endpoint, not just per licence.'
        else 'Read the error text and fix the cause. Do not disable the sync - a disabled sync is a silent one.' end,
      rec.err||' of '||rec.att||' runs failed in 24 hours = '
        ||round(100.0*rec.err/rec.att)||' percent. Last error: '||coalesce(rec.last_err,'none'))
    on conflict do nothing;
    raised := 'sync failing'; detail := rec.endpoint||' / '||coalesce(rec.license,'-'); return next;
  end loop;

  for rec in
    select display_name, status, agent_key from v_agent_health
    where status in ('OVERDUE','NEVER RAN') and enabled
  loop
    insert into watchdog_findings
      (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
       why_it_matters, how_it_was_detected, what_to_do)
    values (v_run_id, 'agent-silent:'||rec.agent_key,
      case when rec.status='NEVER RAN' then 'critical' else 'elevated' end,
      rec.display_name||' — '||rec.status,
      'Agent registry · '||rec.agent_key, 'Vincent',
      'An agent that has stopped looks exactly like an agent with nothing to report. Silence is the failure we cannot see.',
      'Compared each agent''s last run against the interval declared in agent_registry.',
      'Find out whether it is broken or was switched off deliberately. If deliberate, disable it in agent_registry so it stops reporting as overdue.')
    on conflict do nothing;
    raised := rec.status; detail := rec.display_name; return next;
  end loop;

  for rec in
    select endpoint, license, count(*) n from metrc_sync_runs
    where started_at > now() - interval '24 hours'
      and status='ok' and coalesce(records,0)=0
    group by 1,2 having count(*) >= 5
  loop
    insert into watchdog_findings
      (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
       why_it_matters, how_it_was_detected, what_to_do)
    values (v_run_id, 'sync-empty:'||rec.endpoint||':'||coalesce(rec.license,'-'), 'watch',
      'Sync "'||rec.endpoint||'" reports success but returns no records',
      'Metrc sync · '||rec.endpoint, 'Vincent',
      'A sync that succeeds with nothing in it reads as healthy on every dashboard. It may be correct - or it may be pointed at the wrong window.',
      'Counted runs in the last 24 hours with status ok and zero records.',
      'Confirm there genuinely is nothing new. If there should be, check the date window and the licence.')
    on conflict do nothing;
    raised := 'sync empty'; detail := rec.endpoint; return next;
  end loop;

  update watchdog_runs w
     set findings_raised = (select count(*) from watchdog_findings f where f.run_id = v_run_id)
   where w.id = v_run_id;
end $$;

grant execute on function tg_sync_review() to authenticated;;
