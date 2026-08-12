-- Agent I, 12 Aug 2026. DBI-077.
--
-- OWNER: "this OS needs an agent built in to watch over all syncs and mapping of data it must
-- address issue and alert us. we need to add platform IT area at the bottom of the command dash
-- were we monitor our platform and all platform agents, reviews, brain, second brain, loop and
-- all IT platform issues."
--
-- WHY THIS IS WIRING, NOT A BUILD. Nearly every watcher he wants ALREADY EXISTS and reports to
-- nobody: v_agent_health, v_loop_health, v_cron_health, v_matview_freshness, v_watchdog_current,
-- v_all_sync_runs, v_agent_agreement, brain_claims, v_tile_drill_status, correction_proposal.
-- Ten windows, none of them on a screen he opens. That is exactly how the Metrc lab feed sat dark
-- for six days and 17,559 lab result rows were discarded unseen. The defect was never a missing
-- watcher — it was that no watcher was anywhere he would see it.
--
-- ONE ROW PER SUBSYSTEM, one shape: area, subsystem, state, headline, detail, items, bad_items,
-- drill. The band renders it and does not re-derive it.
--
-- ON JUDGEMENT: where a source publishes its own verdict I MATCH ON PATTERNS rather than assume an
-- exact enum, because I have not enumerated every verdict string these views emit and will not
-- guess one. A false green here would be worse than no tile.
--
-- UNDO: drop view v_platform_it.

create or replace view public.v_platform_it as
with sync_state as (
  select system,
         max(started_at) as last_run,
         count(*) filter (where status ilike '%err%' or status ilike '%fail%') as failed
  from v_all_sync_runs
  where started_at > now() - interval '7 days'
  group by system
)
select 'SYNCS'::text as area, 'Data coming in'::text as subsystem,
       case when count(*) filter (where last_run < now() - interval '48 hours') > 0 then 'bad'
            when count(*) filter (where failed > 0) > 0 then 'watch' else 'good' end as state,
       count(*) filter (where last_run < now() - interval '48 hours')::text
         || ' of ' || count(*)::text || ' systems dark over 48h' as headline,
       coalesce(string_agg(system || ' — ' ||
              case when last_run is null then 'never'
                   else round(extract(epoch from (now()-last_run))/3600)::text || 'h ago' end,
              ' · ' order by last_run nulls first)
              filter (where last_run < now() - interval '48 hours'),
              'every system has run inside 48 hours') as detail,
       count(*)::bigint as items,
       count(*) filter (where last_run < now() - interval '48 hours')::bigint as bad_items,
       'metrc-sync-runs'::text as drill
from sync_state

union all
select 'SCHEDULED JOBS', 'Cron',
       case when count(*) filter (where verdict ilike '%fail%' or verdict ilike '%never%'
                                     or verdict ilike '%dark%' or verdict ilike '%stall%') > 0 then 'bad'
            when count(*) filter (where failed_24h > 0) > 0 then 'watch' else 'good' end,
       count(*) filter (where failed_24h > 0)::text || ' of ' || count(*)::text || ' jobs failed in 24h',
       coalesce(string_agg(jobname || ' — ' || verdict, ' · ' order by hours_since_success desc nulls first)
         filter (where verdict ilike '%fail%' or verdict ilike '%never%'
                    or verdict ilike '%dark%' or verdict ilike '%stall%' or failed_24h > 0),
         'every scheduled job succeeded in the last 24 hours'),
       count(*)::bigint, count(*) filter (where failed_24h > 0)::bigint, 'cron_health'
from v_cron_health where active

union all
select 'DATA FRESHNESS', 'Materialised views',
       case when count(*) filter (where not has_clock) > 0 then 'bad'
            when count(*) filter (where verdict ilike '%stale%' or verdict ilike '%never%') > 0 then 'watch'
            else 'good' end,
       count(*) filter (where not has_clock)::text || ' of ' || count(*)::text
         || ' cannot report their own age',
       coalesce(string_agg(matview || ' — ' || verdict, ' · ' order by matview)
         filter (where not has_clock or verdict ilike '%stale%' or verdict ilike '%never%'),
         'every matview carries a clock and is fresh'),
       count(*)::bigint, count(*) filter (where not has_clock)::bigint, 'maint:dashboards'
from v_matview_freshness

union all
select 'FINDINGS', 'Watchdog — open now',
       case when count(*) filter (where severity ilike 'crit%') > 0 then 'bad'
            when count(*) > 0 then 'watch' else 'good' end,
       count(*)::text || ' open · ' || count(*) filter (where severity ilike 'crit%')::text || ' critical',
       coalesce(string_agg(what, ' · ' order by observed_at desc) filter (where severity ilike 'crit%'),
         'no critical findings open'),
       count(*)::bigint, count(*) filter (where severity ilike 'crit%')::bigint, 'intelligence_briefing'
from v_watchdog_current

union all
select 'AGENTS', 'Platform agents',
       case when count(*) filter (where status ilike '%fail%' or status ilike '%never%'
                                    or status ilike '%late%' or status ilike '%overdue%') > 0 then 'bad'
            when count(*) filter (where errors_24h > 0) > 0 then 'watch' else 'good' end,
       count(*) filter (where status ilike '%fail%' or status ilike '%never%'
                          or status ilike '%late%' or status ilike '%overdue%')::text
         || ' of ' || count(*)::text || ' agents not reporting as expected',
       coalesce(string_agg(display_name || ' — ' || status, ' · ' order by minutes_since_run desc nulls first)
         filter (where status ilike '%fail%' or status ilike '%never%'
                    or status ilike '%late%' or status ilike '%overdue%' or errors_24h > 0),
         'every enabled agent ran inside its expected window'),
       count(*)::bigint,
       count(*) filter (where status ilike '%fail%' or status ilike '%never%'
                          or status ilike '%late%' or status ilike '%overdue%')::bigint,
       'agent_health'
from v_agent_health where enabled

union all
select 'REVIEWS', 'Agents disagreeing',
       case when count(*) filter (where agreement ilike '%disagree%') > 0 then 'bad'
            when count(*) > 0 then 'watch' else 'good' end,
       count(*) filter (where agreement ilike '%disagree%')::text || ' subjects where agents disagree',
       coalesce(string_agg(subject || ' — ' || coalesce(what_is_wrong, agreement), ' · '
                order by pct_apart desc nulls last) filter (where agreement ilike '%disagree%'),
         'no open disagreement between agents'),
       count(*)::bigint, count(*) filter (where agreement ilike '%disagree%')::bigint, 'agent_health'
from v_agent_agreement

union all
select 'BRAIN', 'Written claims vs the database',
       case when count(*) filter (where drifted) > 0 then 'bad' else 'good' end,
       count(*) filter (where drifted)::text || ' of ' || count(*)::text
         || ' brain claims have drifted from the data',
       coalesce(string_agg(claim_key || ' — ' || brain_file, ' · ' order by claim_key)
         filter (where drifted), 'every written claim still matches the database'),
       count(*)::bigint, count(*) filter (where drifted)::bigint, 'intelligence_briefing'
from brain_claims

union all
select 'LOOP', 'Automations',
       case when count(*) filter (where verdict ilike '%fail%' or verdict ilike '%stall%'
                                    or verdict ilike '%never%') > 0 then 'bad'
            when count(*) filter (where failed_7d > 0) > 0 then 'watch' else 'good' end,
       count(*) filter (where failed_7d > 0)::text || ' of ' || count(*)::text || ' loops failed in 7 days',
       coalesce(string_agg(jobname || ' — ' || verdict, ' · ' order by jobname)
         filter (where verdict ilike '%fail%' or verdict ilike '%stall%' or verdict ilike '%never%'),
         'every loop ran clean for 7 days'),
       count(*)::bigint, count(*) filter (where failed_7d > 0)::bigint, 'cron_health'
from v_loop_health where active

union all
select 'SCREEN TRUTH', 'Tiles vs their own drills',
       case when count(*) filter (where verdict not like 'AGREE%') > 0 then 'bad' else 'good' end,
       count(*) filter (where verdict not like 'AGREE%')::text || ' of ' || count(*)::text
         || ' tiles disagree with their own drill',
       coalesce(string_agg(tile_label || ' — ' || verdict, ' · ' order by tile_label)
         filter (where verdict not like 'AGREE%'), 'every registered tile reconciles to its drill'),
       count(*)::bigint, count(*) filter (where verdict not like 'AGREE%')::bigint, 'stock_on_hand'
from v_tile_drill_status

union all
select 'YOUR DECISIONS', 'Proposals awaiting you',
       case when count(*) filter (where severity = 'critical') > 0 then 'bad'
            when count(*) > 0 then 'watch' else 'good' end,
       count(*)::text || ' waiting · ' || count(*) filter (where severity='critical')::text || ' critical',
       coalesce(string_agg(target_object || ' — ' || left(the_issue, 90), ' · '
                order by case severity when 'critical' then 1 when 'elevated' then 2 else 3 end, raised_at)
         filter (where severity in ('critical','elevated')), 'nothing is waiting on you'),
       count(*)::bigint, count(*) filter (where severity='critical')::bigint, 'intelligence_briefing'
from correction_proposal where status = 'proposed';

comment on view public.v_platform_it is
 'THE PLATFORM IT BAND — one window over the whole machine. Built 12 Aug 2026 on the owner''s '
 'order to monitor "our platform and all platform agents, reviews, brain, second brain, loop and '
 'all IT platform issues". Ten subsystems, one shape. Almost none of it is new: ten watchers '
 'already existed and reported to NOBODY, which is precisely how the Metrc lab feed sat dark six '
 'days and 17,559 lab rows were discarded unseen. The defect was never a missing watcher — it was '
 'that no watcher sat on a screen the owner opens.';;
