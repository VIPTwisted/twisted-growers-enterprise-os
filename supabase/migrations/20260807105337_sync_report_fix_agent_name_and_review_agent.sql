/* Fix: v_sync_report joined agent_registry on a condition that was always
   false, so "agent" was permanently null. Map the endpoint to the registry
   properly instead. */

create or replace view v_sync_report as
with named as (
  select r.*,
    case
      when r.endpoint ilike 'transfers%'      then 'Manifests sync'
      when r.endpoint ilike 'packages%'       then 'Packages sync'
      when r.endpoint ilike 'harvests%'
        or r.endpoint ilike 'plants%'
        or r.endpoint ilike 'plantbatches%'   then 'Cultivation sync'
      when r.endpoint in ('items','strains','locations') then 'Reference data sync'
      when r.endpoint ilike 'sales%'          then 'Sales sync'
      when r.endpoint ilike 'lab%'            then 'Lab results sync'
      when r.endpoint ilike 'documents%'      then 'Document fetch'
      when r.endpoint ilike 'google_sheet%'   then 'Google Sheet sync'
      when r.endpoint ilike 'clickup%'        then 'ClickUp sync'
      else r.endpoint
    end as agent
  from metrc_sync_runs r
)
select
  id as run_id, endpoint, agent, license as licence,
  started_at at time zone 'America/New_York'  as started_local,
  finished_at at time zone 'America/New_York' as finished_local,
  round(extract(epoch from (finished_at - started_at)))::int as seconds,
  status, records,
  case
    when status='ok' and coalesce(records,0) > 0 then 'Completed — '||records||' records'
    when status='ok' and coalesce(records,0) = 0
      then 'Completed but brought back NOTHING — check whether that is correct'
    when status='running' and started_at < now() - interval '1 hour'
      then 'STUCK — started over an hour ago and never finished'
    when status='running' then 'Running'
    when error ilike '%401%'
      then 'FAILED — Metrc refused the credentials (401) for licence '||coalesce(license,'?')
    when error ilike '%400%'
      then 'FAILED — Metrc rejected the request (400). Usually a bad date range or page size.'
    when error ilike '%unique or exclusion%'
      then 'FAILED — our own database rejected the rows (missing unique constraint)'
    when error ilike '%timeout%' or error ilike '%timed out%' then 'FAILED — timed out'
    else 'FAILED — '||left(coalesce(error,'no reason recorded'),90)
  end as what_happened,
  error as full_error,
  (status='ok' and coalesce(records,0)=0) as completed_empty,
  case when license='MC281714' then 'Cultivation'
       when license='MP281909' then 'Manufacturing'
       when license='both'     then 'Both licences'
       when license='-'        then 'Not licence-specific'
       else 'UNRECOGNISED LICENCE — '||coalesce(license,'null') end as licence_name
from named;

grant select on v_sync_report to authenticated;

/* ---------------------------------------------------------------
   THE REVIEW AGENT
   Reads the sync record and raises findings, so a failing sync lands on the
   CEO dashboard beside everything else rather than dying in a log. Writes to
   watchdog_findings, which flows into v_findings.

   Fingerprints are stable per problem, so a sync failing for the fiftieth day
   updates one finding rather than creating fifty.
   --------------------------------------------------------------- */
create or replace function tg_sync_review()
returns table (raised text, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare rec record; run_id bigint;
begin
  insert into watchdog_runs (ran_at, ran_by, notes)
  values (now(), 'tg_sync_review', 'automated review of sync health')
  returning id into run_id;

  /* 1. Any sync failing more than a fifth of its runs in 24 hours */
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
    values (run_id, 'sync-failing:'||rec.endpoint||':'||coalesce(rec.license,'-'),
      case when rec.err = rec.att then 'critical' else 'elevated' end,
      'Sync "'||rec.endpoint||'" is failing on licence '||coalesce(rec.license,'?'),
      'Metrc sync · '||rec.endpoint, 'Vincent',
      (select min(started_at)::text from metrc_sync_runs
        where endpoint=rec.endpoint and status='error'),
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

  /* 2. Any registered agent past due, or that has never run */
  for rec in
    select display_name, status, note, agent_key from v_agent_health
    where status in ('OVERDUE','NEVER RAN') and enabled
  loop
    insert into watchdog_findings
      (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
       why_it_matters, how_it_was_detected, what_to_do)
    values (run_id, 'agent-silent:'||rec.agent_key,
      case when rec.status='NEVER RAN' then 'critical' else 'elevated' end,
      rec.display_name||' — '||rec.status,
      'Agent registry · '||rec.agent_key, 'Vincent',
      'An agent that has stopped looks exactly like an agent with nothing to report. Silence is the failure we cannot see.',
      'Compared each agent''s last run against the interval declared in agent_registry.',
      'Find out whether it is broken or was switched off deliberately. If deliberate, disable it in agent_registry so it stops reporting as overdue.')
    on conflict do nothing;
    raised := rec.status; detail := rec.display_name; return next;
  end loop;

  /* 3. Syncs that succeed but bring back nothing - the quietest failure */
  for rec in
    select endpoint, license, count(*) n from metrc_sync_runs
    where started_at > now() - interval '24 hours'
      and status='ok' and coalesce(records,0)=0
    group by 1,2 having count(*) >= 5
  loop
    insert into watchdog_findings
      (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
       why_it_matters, how_it_was_detected, what_to_do)
    values (run_id, 'sync-empty:'||rec.endpoint||':'||coalesce(rec.license,'-'), 'watch',
      'Sync "'||rec.endpoint||'" reports success but returns no records',
      'Metrc sync · '||rec.endpoint, 'Vincent',
      'A sync that succeeds with nothing in it reads as healthy on every dashboard. It may be correct - or it may be pointed at the wrong window.',
      'Counted runs in the last 24 hours with status ok and zero records.',
      'Confirm there genuinely is nothing new. If there should be, check the date window and the licence.')
    on conflict do nothing;
    raised := 'sync empty'; detail := rec.endpoint; return next;
  end loop;

  update watchdog_runs set findings_raised =
    (select count(*) from watchdog_findings where watchdog_findings.run_id = tg_sync_review.run_id)
  where id = run_id;
end $$;

grant execute on function tg_sync_review() to authenticated;

comment on function tg_sync_review() is
  'Reviews sync health and raises findings into watchdog_findings so failures reach the CEO dashboard instead of dying in a log.';;
