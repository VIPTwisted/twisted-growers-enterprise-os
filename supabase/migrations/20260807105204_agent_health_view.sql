/* Did each agent actually run, and did it produce anything?
   --------------------------------------------------------
   An agent that has stopped looks identical to an agent with nothing to
   report. This separates them:

     ok         ran inside its window
     OVERDUE    has not run when it should have - the dangerous one
     FAILING    running, but more than a fifth of its runs error
     NEVER RAN  registered and has never produced anything
     off        deliberately disabled

   Sync agents are judged on metrc_sync_runs, watchers on the findings they
   write, maintenance on its own log. */

create or replace view v_agent_health as
with sync_ev as (
  select case
           when endpoint ilike 'transfers%'   then 'sync:transfers'
           when endpoint ilike 'packages%'    then 'sync:packages'
           when endpoint ilike 'harvests%' or endpoint ilike 'plants%'
             or endpoint ilike 'plantbatches%'                then 'sync:cultivation'
           when endpoint in ('items','strains','locations')   then 'sync:reference'
           when endpoint ilike 'sales%'                       then 'sync:sales'
         end as agent_key,
         max(started_at) as last_run,
         count(*) filter (where started_at > now() - interval '24 hours')                     as runs_24h,
         count(*) filter (where status='error' and started_at > now() - interval '24 hours')  as errors_24h,
         sum(records) filter (where status='ok' and started_at > now() - interval '24 hours') as records_24h,
         max(error) filter (where status='error')                                             as last_error
  from metrc_sync_runs group by 1
),
watch_ev as (
  select case agent
           when 'Allocation control' then 'watch:allocation'
           when 'Cash velocity'      then 'watch:cash'
           when 'Compliance watch'   then 'watch:compliance'
           when 'Room turnaround'    then 'watch:room'
           when 'Schedule discipline' then 'watch:schedule'
           when 'Loss and yield'     then 'watch:loss'
           else 'watch:sales'
         end as agent_key,
         max(detected_at) as last_run, count(*) as produced
  from agent_findings group by 1
  union all
  select 'watch:watchdog', max(ran_at), count(*) from watchdog_runs
  union all
  select 'watch:custody', max(captured_at), count(*) from custody_alert_log
  union all
  select 'watch:inventory', max(last_seen), count(*) from inventory_alerts
  union all
  select 'maint:canary', max(ran_at), count(*) from canary_runs
),
ev as (
  select agent_key, last_run, runs_24h, errors_24h, records_24h, last_error, null::bigint as produced
  from sync_ev where agent_key is not null
  union all
  select agent_key, last_run, null, null, null, null, produced from watch_ev
)
select
  r.agent_key, r.display_name, r.kind, r.what_it_watches, r.why_it_matters,
  r.owner, r.expected_every_mins, r.verified_by, r.enabled,
  e.last_run,
  round(extract(epoch from now() - e.last_run)/60)::int as minutes_since_run,
  e.runs_24h, e.errors_24h, e.records_24h, e.produced,
  left(coalesce(e.last_error,''),140) as last_error,
  case
    when not r.enabled                                        then 'off'
    when e.last_run is null                                   then 'NEVER RAN'
    when r.expected_every_mins is not null
     and e.last_run < now() - make_interval(mins => r.expected_every_mins * 2)
                                                              then 'OVERDUE'
    when coalesce(e.runs_24h,0) > 0
     and e.errors_24h::numeric / e.runs_24h > 0.2              then 'FAILING'
    else 'ok'
  end as status,
  case
    when e.last_run is null then 'Registered but has never produced anything. Either it has never run or it writes somewhere we are not looking.'
    when r.expected_every_mins is not null
     and e.last_run < now() - make_interval(mins => r.expected_every_mins * 2)
      then 'Expected every '||r.expected_every_mins||' minutes. Last ran '
           ||round(extract(epoch from now()-e.last_run)/3600)||' hours ago. Silence here is not good news.'
    when coalesce(e.runs_24h,0) > 0 and e.errors_24h::numeric/e.runs_24h > 0.2
      then e.errors_24h||' of '||e.runs_24h||' runs failed in 24 hours.'
    else null
  end as note
from agent_registry r
left join ev e on e.agent_key = r.agent_key;

grant select on v_agent_health to authenticated;

comment on view v_agent_health is
  'Health of every agent. OVERDUE is the important state - an agent that has stopped looks the same as one with nothing to report.';;
