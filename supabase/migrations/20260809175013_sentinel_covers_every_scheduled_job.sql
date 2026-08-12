/* SENTINEL COVERAGE: 4 SOURCES AGAINST 42 SCHEDULED JOBS.

   Agent F, 9 August 2026: "The sentinel watches 4 sources against 42 cron jobs.
   It was built because the Metrc sync was dead 7h16m while every dashboard
   reported success. At 4 expectations, roughly 90% of your scheduled work could
   go silent the same way tomorrow." Verified: 42 active jobs, 4 expectations.

   THE OBVIOUS FIX IS THE WRONG ONE. f_sentinel_check carries a hardcoded probe
   per source_key, and the comment beside it is right to: a threshold is
   configuration, an executable query is code, and code in a config table is an
   attack surface. But writing 38 more branches by hand produces a maintained
   list, and a maintained list rots - the next job somebody schedules is invisible
   again, silently, which is this exact failure wearing a new hat.

   So cron coverage is DERIVED. Every active job is watched because it is
   scheduled, not because somebody remembered to add it. Nothing to maintain, and
   a job added tomorrow is covered the moment it exists.

   AND THE DISTINCTION THE ORIGINAL DESIGN GOT RIGHT, WHICH THIS MUST NOT LOSE.
   A cron job can fire, report success, and the work still be dead. That is
   precisely what happened on 7 August: tg_metrc_fire dispatched, cron recorded
   success, the gateway rejected every call with 401, and metrc_scan_schedule
   kept reading "dispatched (scheduled)". Cron-level watching would have called
   that healthy.

   Two levels, and they are not equivalent:
     FIRING  - the schedule ran. Derived, free, covers all 42.
     OUTPUT  - the work produced something. Hand-written, covers 4, and is the
               only one that would have caught 7 August.

   v_sentinel_coverage says plainly which jobs have only the weaker guarantee, so
   "42 of 42 covered" can never be mistaken for "42 of 42 proven working". */
create or replace view v_sentinel_cron_silence as
with runs as (
  select d.jobid, d.status, d.start_time
  from cron.job_run_details d
  where d.start_time > now() - interval '14 days'
),
gaps as (
  select jobid,
         extract(epoch from (start_time - lag(start_time) over (partition by jobid order by start_time))) as gap
  from runs where status = 'succeeded'
),
cadence as (
  select jobid, percentile_cont(0.5) within group (order by gap) as usual_gap
  from gaps where gap is not null group by jobid
),
last_ok as (
  select jobid, max(start_time) as last_success
  from runs where status = 'succeeded' group by jobid
)
select j.jobname,
       j.schedule,
       l.last_success,
       round(extract(epoch from (now() - l.last_success)) / 60)::int as silent_minutes,
       round(c.usual_gap / 60)::int                                  as usual_gap_minutes,
       /* Windowed schedules are exempt: a job that only runs overnight is asleep
          at three in the afternoon, not silent. Learned the hard way on
          v_loop_health, which called two healthy backfills late. */
       (split_part(j.schedule, ' ', 2) !~ '^([*]|[*]/[0-9]+)$') as runs_only_in_a_window,
       case
         when l.last_success is null then 'NEVER SUCCEEDED'
         when (split_part(j.schedule, ' ', 2) !~ '^([*]|[*]/[0-9]+)$') then 'ok (windowed)'
         when c.usual_gap is null then 'ok (too few runs to judge)'
         when extract(epoch from (now() - l.last_success)) > c.usual_gap * 3 then 'SILENT'
         else 'ok'
       end as verdict
from cron.job j
left join cadence c on c.jobid = j.jobid
left join last_ok l on l.jobid = j.jobid
where j.active
order by
  case when l.last_success is null then 0
       when extract(epoch from (now() - l.last_success)) > coalesce(c.usual_gap,1e9) * 3 then 1
       else 2 end,
  j.jobname;

comment on view v_sentinel_cron_silence is
  'Every ACTIVE scheduled job, watched for silence, derived from the schedule itself so a job added tomorrow is covered the moment it exists. Silence is judged against each job''s own median gap, times three - never a fixed number. This proves a job FIRED. It does NOT prove the work happened: on 7 Aug 2026 the Metrc dispatch fired, cron recorded success, and the gateway rejected every call. That is what the hand-written output probes in sentinel_expectation are for.';

/* One place that answers "what is actually watched, and how well". */
create or replace view v_sentinel_coverage as
select j.jobname,
       true                                          as firing_watched,
       (e.source_key is not null)                    as output_watched,
       e.source_key                                  as output_probe,
       case
         when e.source_key is not null
           then 'both - the schedule is watched AND the work it produces is checked'
         else 'FIRING ONLY - if this job runs and produces nothing, nothing notices'
       end                                           as guarantee
from cron.job j
left join sentinel_expectation e
       on e.enabled
      and (j.jobname like '%' || replace(e.source_key, '_', '%') || '%')
where j.active
order by (e.source_key is not null), j.jobname;

comment on view v_sentinel_coverage is
  'What the sentinel actually guarantees, per job. FIRING coverage is derived and total. OUTPUT coverage is hand-written and partial, and it is the only kind that would have caught 7 Aug 2026 - the dispatch fired, cron recorded success, and every call was rejected at the gateway. "Covered" must never be read as "proven working".';

grant select on v_sentinel_cron_silence to authenticated;
grant select on v_sentinel_coverage to authenticated;

select (select count(*) from v_sentinel_cron_silence)                              as jobs_now_watched,
       (select count(*) from v_sentinel_cron_silence where verdict = 'SILENT')      as silent_now,
       (select count(*) from v_sentinel_cron_silence where verdict = 'NEVER SUCCEEDED') as never_ok,
       (select count(*) from v_sentinel_coverage where output_watched)              as output_watched;;
