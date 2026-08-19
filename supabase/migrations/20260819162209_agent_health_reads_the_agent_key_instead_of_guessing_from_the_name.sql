/* ═══════════════════════════════════════════════════════════════════════════
   THE VIEW THAT WATCHES THE WATCHERS CREDITED ONE LANE WITH EVERYONE'S WORK.

   v_agent_health mapped agent_findings to an agent with a hardcoded CASE on the
   DISPLAY NAME, ending in `ELSE 'watch:sales'`. agent_findings.agent_key — the
   column that exists for exactly this, and which carries a foreign key to
   agent_registry — was never read.

   Two failures fell out of that one line, in opposite directions, and both were
   measured before this migration was written:

   · MISATTRIBUTION. 57 findings across 8 real agent keys were credited to
     watch:sales, which produced none of them. Sales showed "produced 61,
     status ok" while having done no work at all.

   · BLINDNESS. Every lane agent — B, M, P, S, V, W, X — reported "NEVER RAN"
     even four minutes after writing findings, because their display names were
     not in the CASE. A lane that has gone genuinely quiet and a lane that just
     filed thirteen defects produced the identical status, so the view could
     never tell them apart. The owner asked why the agents do not report; this
     view is a large part of the answer. They reported and it looked away.

   The fix is to read agent_key first and fall back to the name map only for the
   472 legacy rows written before that column existed. Nothing else changes:
   same columns, same order, same names, so rule E1 holds.
   ═══════════════════════════════════════════════════════════════════════════ */
create or replace view public.v_agent_health as
with sync_ev as (
  select
    case
      when metrc_sync_runs.endpoint ilike 'transfers%' then 'sync:transfers'
      when metrc_sync_runs.endpoint ilike 'packages%' then 'sync:packages'
      when metrc_sync_runs.endpoint ilike 'harvests%' or metrc_sync_runs.endpoint ilike 'plants%'
        or metrc_sync_runs.endpoint ilike 'plantbatches%' then 'sync:cultivation'
      when metrc_sync_runs.endpoint = any (array['items','strains','locations']) then 'sync:reference'
      when metrc_sync_runs.endpoint ilike 'sales%' then 'sync:sales'
      else null
    end as agent_key,
    max(metrc_sync_runs.started_at) as last_run,
    count(*) filter (where metrc_sync_runs.started_at > now() - interval '24 hours') as runs_24h,
    count(*) filter (where metrc_sync_runs.status = 'error' and metrc_sync_runs.started_at > now() - interval '24 hours') as errors_24h,
    sum(metrc_sync_runs.records) filter (where metrc_sync_runs.status = 'ok' and metrc_sync_runs.started_at > now() - interval '24 hours') as records_24h,
    max(metrc_sync_runs.error) filter (where metrc_sync_runs.status = 'error') as last_error
  from metrc_sync_runs
  group by 1
), watch_ev as (
  /* agent_key FIRST. The name map survives only as a fallback for rows written
     before agent_findings had the column, and it no longer has a catch-all:
     a finding this view cannot attribute is now attributed to NOTHING and
     disappears from every lane's count, which is visible. Sweeping it into
     watch:sales was not. */
  select
    coalesce(agent_findings.agent_key,
      case agent_findings.agent
        when 'Allocation control'   then 'watch:allocation'
        when 'Cash velocity'        then 'watch:cash'
        when 'Compliance watch'     then 'watch:compliance'
        when 'Room turnaround'      then 'watch:room'
        when 'Schedule discipline'  then 'watch:schedule'
        when 'Loss and yield'       then 'watch:loss'
        when 'Sales, Orders and Fulfilment' then 'watch:sales'
        else null
      end) as agent_key,
    max(agent_findings.detected_at) as last_run,
    count(*) as produced
  from agent_findings
  group by 1
  union all
  select 'watch:watchdog', max(watchdog_runs.ran_at), count(*) from watchdog_runs
  union all
  select 'watch:custody', max(custody_alert_log.captured_at), count(*) from custody_alert_log
  union all
  select 'watch:inventory', max(inventory_alerts.last_seen), count(*) from inventory_alerts
  union all
  select 'maint:canary', max(canary_runs.ran_at), count(*) from canary_runs
), ev as (
  select sync_ev.agent_key, sync_ev.last_run, sync_ev.runs_24h, sync_ev.errors_24h,
         sync_ev.records_24h, sync_ev.last_error, null::bigint as produced
  from sync_ev where sync_ev.agent_key is not null
  union all
  select watch_ev.agent_key, watch_ev.last_run, null::bigint, null::bigint,
         null::bigint, null::text, watch_ev.produced
  from watch_ev where watch_ev.agent_key is not null
)
select r.agent_key, r.display_name, r.kind, r.what_it_watches, r.why_it_matters,
       r.owner, r.expected_every_mins, r.verified_by, r.enabled,
       e.last_run,
       round(extract(epoch from now() - e.last_run) / 60::numeric)::integer as minutes_since_run,
       e.runs_24h, e.errors_24h, e.records_24h, e.produced,
       left(coalesce(e.last_error, ''), 140) as last_error,
       case
         when not r.enabled then 'off'
         when e.last_run is null then 'NEVER RAN'
         when r.expected_every_mins is not null
              and e.last_run < now() - make_interval(mins => r.expected_every_mins * 2) then 'OVERDUE'
         when coalesce(e.runs_24h, 0) > 0 and (e.errors_24h::numeric / e.runs_24h::numeric) > 0.2 then 'FAILING'
         else 'ok'
       end as status,
       case
         when e.last_run is null then 'Registered but has never produced anything. Either it has never run or it writes somewhere we are not looking.'
         when r.expected_every_mins is not null
              and e.last_run < now() - make_interval(mins => r.expected_every_mins * 2)
           then 'Expected every ' || r.expected_every_mins || ' minutes. Last ran '
                || round(extract(epoch from now() - e.last_run) / 3600::numeric) || ' hours ago. Silence here is not good news.'
         when coalesce(e.runs_24h, 0) > 0 and (e.errors_24h::numeric / e.runs_24h::numeric) > 0.2
           then e.errors_24h || ' of ' || e.runs_24h || ' runs failed in 24 hours.'
         else null
       end as note
from agent_registry r
left join ev e on e.agent_key = r.agent_key;