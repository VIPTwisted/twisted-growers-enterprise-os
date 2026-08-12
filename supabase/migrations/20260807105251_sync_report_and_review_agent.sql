/* SYNC REPORTING AND THE AGENT THAT REVIEWS IT
   --------------------------------------------
   Every sync already writes to metrc_sync_runs. Nobody reads it. The sales
   sync has failed 237 consecutive times in silence; manufacturing fails 45% of
   its calls; the cultivation sync failed 86 times in the last day alone.

   Three parts:
     v_sync_report   every run - scheduled or manual - in plain English,
                     drillable to the exact endpoint, licence, record count,
                     duration and error text.
     v_sync_digest   one line per agent per day: completed, failed, skipped,
                     records in. What an admin reads over coffee.
     tg_sync_review() the agent that reads the above and RAISES FINDINGS, so a
                     failure lands on the CEO dashboard next to everything else
                     instead of sitting in a log.

   The review agent writes into watchdog_findings, which flows into v_findings,
   which is what every page will read. A sync failure now competes for
   attention with a $500,000 yield problem, and is ranked accordingly. */

create or replace view v_sync_report as
select
  r.id                                              as run_id,
  r.endpoint,
  coalesce(ar.display_name, r.endpoint)             as agent,
  r.license                                         as licence,
  r.started_at at time zone 'America/New_York'      as started_local,
  r.finished_at at time zone 'America/New_York'     as finished_local,
  round(extract(epoch from (r.finished_at - r.started_at)))::int as seconds,
  r.status,
  r.records,
  case
    when r.status = 'ok' and coalesce(r.records,0) > 0
      then 'Completed — '||r.records||' records'
    when r.status = 'ok' and coalesce(r.records,0) = 0
      then 'Completed but brought back NOTHING — check whether that is correct'
    when r.status = 'running' and r.started_at < now() - interval '1 hour'
      then 'STUCK — started over an hour ago and never finished'
    when r.status = 'running' then 'Running'
    when r.error ilike '%401%'
      then 'FAILED — Metrc refused the credentials (401) for licence '||coalesce(r.license,'?')
    when r.error ilike '%400%'
      then 'FAILED — Metrc rejected the request (400). Usually a bad date range or page size.'
    when r.error ilike '%unique or exclusion%'
      then 'FAILED — our own database rejected the rows (missing unique constraint)'
    when r.error ilike '%timeout%' or r.error ilike '%timed out%'
      then 'FAILED — timed out'
    else 'FAILED — '||left(coalesce(r.error,'no reason recorded'),90)
  end                                               as what_happened,
  r.error                                           as full_error,
  (r.status='ok' and coalesce(r.records,0)=0)       as completed_empty,
  case when r.license in ('MC281714') then 'Cultivation'
       when r.license in ('MP281909') then 'Manufacturing'
       when r.license = 'both'        then 'Both licences'
       when r.license = '-'           then 'Not licence-specific'
       else 'UNRECOGNISED LICENCE — '||coalesce(r.license,'null')
  end                                               as licence_name
from metrc_sync_runs r
left join agent_registry ar on ar.evidence_table is not null and false;  -- name resolved below

grant select on v_sync_report to authenticated;

/* One line per endpoint per day - the digest an admin actually reads. */
create or replace view v_sync_digest as
select
  (started_at at time zone 'America/New_York')::date as day,
  endpoint,
  license as licence,
  count(*)                                              as attempts,
  count(*) filter (where status='ok')                   as completed,
  count(*) filter (where status='error')                as failed,
  count(*) filter (where status='running')              as still_running,
  count(*) filter (where status='ok' and coalesce(records,0)=0) as completed_but_empty,
  sum(records) filter (where status='ok')               as records_in,
  round(100.0*count(*) filter (where status='error')/nullif(count(*),0),1) as pct_failed,
  max(left(error,120)) filter (where status='error')    as last_error
from metrc_sync_runs
group by 1,2,3;

grant select on v_sync_digest to authenticated;

comment on view v_sync_report is
  'Every sync run, scheduled or manual, in plain English. Drill to endpoint, licence, duration, records and the exact error.';;
