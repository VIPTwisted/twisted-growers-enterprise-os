/* "NEVER SUCCEEDED" AND "NOT YET DUE" ARE NOT THE SAME THING.

   First run of the cron sentinel flagged four jobs as NEVER SUCCEEDED:
   coverage-watch, forensic-audit, guard-selftest, route-findings. All four have
   run ZERO times and failed ZERO times - they were scheduled within the last few
   hours by other agents and have not reached their first scheduled minute.
   route-findings fires at 12 past the hour; the rest are daily or weekly at 06.

   A brand-new job is not a broken one. Reporting it as broken is the same
   false-label failure that has now been corrected three times in v_loop_health -
   a fixed threshold that broke daily jobs, "ever failed" that never forgave a
   recovery, and a cadence that did not understand overnight windows. Each one
   teaches somebody to stop reading the check, which is the only way a health
   check actually dies. */
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
tally as (
  select jobid,
         count(*)                                        as runs_ever,
         count(*) filter (where status = 'succeeded')     as ok,
         max(start_time) filter (where status = 'succeeded') as last_success
  from runs group by jobid
)
select j.jobname,
       j.schedule,
       t.last_success,
       round(extract(epoch from (now() - t.last_success)) / 60)::int as silent_minutes,
       round(c.usual_gap / 60)::int                                  as usual_gap_minutes,
       (split_part(j.schedule, ' ', 2) !~ '^([*]|[*]/[0-9]+)$')       as runs_only_in_a_window,
       case
         /* Never attempted at all: new, not broken. Said plainly rather than
            dressed as a failure. */
         when coalesce(t.runs_ever, 0) = 0 then 'not yet due - scheduled, never reached its first run'
         when coalesce(t.ok, 0) = 0        then 'NEVER SUCCEEDED - it has run and failed every time'
         when (split_part(j.schedule, ' ', 2) !~ '^([*]|[*]/[0-9]+)$') then 'ok (windowed)'
         when c.usual_gap is null          then 'ok (too few runs to judge)'
         when extract(epoch from (now() - t.last_success)) > c.usual_gap * 3 then 'SILENT'
         else 'ok'
       end as verdict,
       coalesce(t.runs_ever, 0) as runs_ever
from cron.job j
left join cadence c on c.jobid = j.jobid
left join tally   t on t.jobid = j.jobid
where j.active
order by
  case when coalesce(t.runs_ever,0) > 0 and coalesce(t.ok,0) = 0 then 0
       when t.last_success is not null
            and extract(epoch from (now() - t.last_success)) > coalesce(c.usual_gap, 1e9) * 3 then 1
       when coalesce(t.runs_ever,0) = 0 then 2
       else 3 end,
  j.jobname;

comment on view v_sentinel_cron_silence is
  'Every ACTIVE scheduled job, watched for silence, derived from the schedule so a job added tomorrow is covered the moment it exists. Distinguishes NOT YET DUE (scheduled, never reached its first run - new, not broken) from NEVER SUCCEEDED (has run and failed every time). Silence is judged against each job''s own median gap times three, never a fixed number, and a job whose cron restricts the hour is exempt because it is asleep rather than late. This proves a job FIRED; it does not prove the work happened - on 7 Aug 2026 the Metrc dispatch fired, cron recorded success, and the gateway rejected every call.';

select verdict, count(*) from v_sentinel_cron_silence group by verdict order by 2 desc;;
