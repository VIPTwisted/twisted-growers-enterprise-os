-- Agent I, 12 Aug 2026. DBI-078. Correction to my own DBI-077, within the hour, before the owner
-- acted on it.
--
-- WHAT I GOT WRONG. The band reported "14 of 27 agents not reporting as expected" and the owner's
-- response was "this is horrible". Seven of those fourteen are Agents B, M, P, S, V, W and X —
-- the lane agents that have been working all night and produced most of today's findings. They
-- read NEVER RAN because expected_every_mins IS NULL: they are ON-DEMAND, invoked when needed,
-- with no heartbeat to write. I judged on-demand agents by a scheduled-job standard.
--
-- The same error twice more: a loop whose own verdict says "recovered - failed earlier,
-- succeeding now" was counted as a current failure, and a matview with no computed_at column was
-- called 'bad' when the honest word is UNMEASURABLE — the data may be perfectly fresh, we simply
-- cannot prove it. Those are different problems and merging them inflates both.
--
-- THE PRINCIPLE, and it is one this platform already enforces on everyone else: AN AGENT WITH NO
-- DECLARED CADENCE CANNOT BE LATE. Agent TG-08 applied exactly this reasoning today when it
-- refused to infer a cadence from observed behaviour, because inferring one makes lateness normal.
-- I should have applied it before shipping, not after he read the number.
--
-- Nine of ten areas red was not measurement, it was a miscalibrated instrument on top of real
-- problems. The real problems remain and are not softened here: nothing's threshold is relaxed,
-- no failing thing is reclassified as passing. Only the categories are separated so each says
-- what it actually means.
--
-- UNDO: restore the view body from platform_it_one_window_over_the_whole_machine_v2.

create or replace view public.v_platform_it as
with sync_state as (
  select system, max(started_at) as last_run,
         count(*) filter (where status ilike '%err%' or status ilike '%fail%') as failed
  from v_all_sync_runs where started_at > now() - interval '7 days' group by system
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
-- CRON: a verdict that says "recovered" is not a current failure. Judge the state NOW.
select 'SCHEDULED JOBS', 'Cron',
       case when count(*) filter (where verdict ilike '%fail%' and verdict not ilike '%recover%') > 0 then 'bad'
            when count(*) filter (where failed_24h > 0) > 0 then 'watch' else 'good' end,
       count(*) filter (where verdict ilike '%fail%' and verdict not ilike '%recover%')::text
         || ' of ' || count(*)::text || ' jobs failing now',
       coalesce(string_agg(jobname || ' — ' || verdict, ' · ' order by hours_since_success desc nulls first)
         filter (where verdict ilike '%fail%' and verdict not ilike '%recover%'),
         'no scheduled job is currently failing'),
       count(*)::bigint,
       count(*) filter (where verdict ilike '%fail%' and verdict not ilike '%recover%')::bigint,
       'cron_health'
from v_cron_health where active

union all
-- MATVIEWS: "cannot prove it is fresh" is NOT "it is stale". Different words, different tiles.
select 'DATA FRESHNESS', 'Materialised views',
       case when count(*) filter (where verdict ilike '%stale%'
                                    or (verdict ilike '%no refresh%' and not has_clock)) > 0 then 'bad'
            when count(*) filter (where not has_clock) > 0 then 'watch' else 'good' end,
       count(*) filter (where not has_clock)::text || ' of ' || count(*)::text
         || ' cannot prove their own freshness (no clock — not the same as stale)',
       coalesce(string_agg(matview || ' — ' || verdict, ' · ' order by matview)
         filter (where not has_clock or verdict ilike '%stale%'),
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
-- AGENTS: ONLY judge agents that declare a cadence. An on-demand agent cannot be late.
select 'AGENTS', 'Scheduled agents',
       case when count(*) filter (where status ilike '%never%') > 0 then 'bad'
            when count(*) filter (where status ilike '%overdue%' or status ilike '%late%'
                                   or errors_24h > 0) > 0 then 'watch' else 'good' end,
       count(*) filter (where status ilike '%never%' or status ilike '%overdue%'
                          or status ilike '%late%')::text
         || ' of ' || count(*)::text || ' scheduled agents not reporting',
       coalesce(string_agg(display_name || ' — ' || status, ' · ' order by display_name)
         filter (where status ilike '%never%' or status ilike '%overdue%' or status ilike '%late%'),
         'every scheduled agent ran inside its window'),
       count(*)::bigint,
       count(*) filter (where status ilike '%never%' or status ilike '%overdue%'
                          or status ilike '%late%')::bigint,
       'agent_health'
from v_agent_health where enabled and expected_every_mins is not null

union all
-- ON-DEMAND agents reported separately and NEVER as late. Count only, so they are visible
-- without being judged by a clock they were never given.
select 'AGENTS', 'On-demand agents (invoked, not scheduled)', 'good',
       count(*)::text || ' lane agents available on demand — no cadence, so never "late"',
       string_agg(display_name, ' · ' order by display_name),
       count(*)::bigint, 0::bigint, 'agent_health'
from v_agent_health where enabled and expected_every_mins is null

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
       case when count(*) filter (where drifted) > 0 then 'watch' else 'good' end,
       count(*) filter (where drifted)::text || ' of ' || count(*)::text
         || ' brain claims have drifted — documents to update, not data that is wrong',
       coalesce(string_agg(claim_key || ' — ' || brain_file, ' · ' order by claim_key)
         filter (where drifted), 'every written claim still matches the database'),
       count(*)::bigint, count(*) filter (where drifted)::bigint, 'intelligence_briefing'
from brain_claims

union all
select 'LOOP', 'Automations',
       case when count(*) filter (where verdict ilike '%fail%' and verdict not ilike '%recover%') > 0 then 'bad'
            when count(*) filter (where verdict ilike '%recover%') > 0 then 'watch' else 'good' end,
       count(*) filter (where verdict ilike '%fail%' and verdict not ilike '%recover%')::text
         || ' of ' || count(*)::text || ' loops failing now',
       coalesce(string_agg(jobname || ' — ' || verdict, ' · ' order by jobname)
         filter (where verdict ilike '%fail%'),
         'every loop is running clean'),
       count(*)::bigint,
       count(*) filter (where verdict ilike '%fail%' and verdict not ilike '%recover%')::bigint,
       'cron_health'
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
 'THE PLATFORM IT BAND — one window over the whole machine. Recalibrated within the hour of first '
 'shipping, because it OVERSTATED: it judged on-demand lane agents by a scheduled-job clock and '
 'counted recovered jobs as current failures. An agent with no declared cadence cannot be late; a '
 'matview with no clock is UNMEASURABLE, not stale. No threshold was relaxed and nothing failing '
 'was reclassified as passing — the categories were separated so each says what it actually means. '
 'Every source here already existed and reported to nobody, which is how the Metrc lab feed sat '
 'dark six days and 17,559 lab rows were discarded unseen.';;
