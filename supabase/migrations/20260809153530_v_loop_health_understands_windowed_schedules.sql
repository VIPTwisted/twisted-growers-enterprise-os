/* THIRD ITERATION, and the third false-positive class removed.

   The calibrated version called metrc-documents-backfill and
   parse-documents-backfill LATE. They are not. Their schedules restrict the HOUR
   field to an overnight window - one runs every fifteen minutes between midnight
   and eight, the other every minute between one and seven - so between nine in
   the morning and midnight they are always long past their normal gap. 830
   successes between them, zero failures, and my view called them overdue.

   Median-gap calibration measures how often a job runs WHEN IT IS RUNNING. It
   knows nothing about a job that is not due yet. So a schedule with a restricted
   hour field is exempt from LATE: it is not overdue, it is asleep.

   Three versions, three classes of wrong label - a fixed threshold that broke on
   daily jobs, "ever failed" that never forgave a recovery, and a cadence that
   did not understand windows. Each would have taught somebody to ignore this
   view, which is the only way a health check really dies.

   (The previous attempt at this migration failed to parse: the comment quoted a
   cron expression containing star-slash, which closes a C-style comment. Worth
   the line - it cost a round trip and would cost the next person one too.) */
create or replace view v_loop_health as
with recent as (
  select d.jobid, d.status, d.start_time, d.end_time,
         extract(epoch from (d.end_time - d.start_time)) as secs
  from cron.job_run_details d
  where d.start_time > now() - interval '7 days'
),
gaps as (
  select jobid,
         extract(epoch from (start_time - lag(start_time) over (partition by jobid order by start_time))) as gap
  from recent where status = 'succeeded'
),
cadence as (
  select jobid, percentile_cont(0.5) within group (order by gap) as usual_gap
  from gaps where gap is not null group by jobid
),
norm as (
  select jobid,
         percentile_cont(0.95) within group (order by secs) filter (where secs is not null) as p95_secs,
         count(*) filter (where status = 'succeeded') as ok_7d,
         count(*) filter (where status = 'failed')    as failed_7d,
         max(start_time) filter (where status = 'succeeded') as last_success,
         max(start_time) filter (where status = 'failed')    as last_failure
  from recent group by jobid
),
live as (
  select jobid, min(start_time) as running_since
  from recent where status = 'running' and end_time is null group by jobid
),
shape as (
  select j.jobid,
         (split_part(j.schedule, ' ', 2) !~ '^([*]|[*]/[0-9]+)$') as runs_in_a_window
  from cron.job j
)
select j.jobname,
       j.schedule,
       j.active,
       coalesce(n.ok_7d, 0)     as succeeded_7d,
       coalesce(n.failed_7d, 0) as failed_7d,
       n.last_success,
       round(n.p95_secs)::int   as usual_seconds,
       round(extract(epoch from (now() - l.running_since)))::int as running_for_seconds,
       case
         when not j.active then 'switched off'
         when coalesce(n.ok_7d,0) = 0 and coalesce(n.failed_7d,0) = 0
              then 'has not run at all in 7 days'
         when coalesce(n.ok_7d,0) = 0 then 'NEVER SUCCEEDED - every run failed'
         when l.running_since is not null and n.p95_secs is not null
              and extract(epoch from (now() - l.running_since)) > greatest(n.p95_secs * 4, 300)
              then 'HUNG - running far longer than it ever normally takes'
         when n.last_failure is not null and n.last_failure > n.last_success
              then 'FAILING - its most recent run failed'
         when c.usual_gap is not null
              and not coalesce(s.runs_in_a_window, false)
              and n.last_success < now() - make_interval(secs => c.usual_gap * 2.5)
              then 'LATE - overdue against its own normal interval'
         when coalesce(n.failed_7d,0) > 0 then 'recovered - failed earlier, succeeding now'
         else 'healthy'
       end as verdict,
       round(c.usual_gap)::int  as usual_gap_seconds,
       n.last_failure,
       coalesce(s.runs_in_a_window, false) as runs_only_in_a_window
from cron.job j
left join norm n    on n.jobid = j.jobid
left join cadence c on c.jobid = j.jobid
left join live l    on l.jobid = j.jobid
left join shape s   on s.jobid = j.jobid
order by
  case
    when not j.active then 5
    when coalesce(n.ok_7d,0) = 0 then 0
    when n.last_failure is not null and n.last_failure > n.last_success then 1
    when coalesce(n.failed_7d,0) > 0 then 3
    else 4
  end, j.jobname;

comment on view v_loop_health is
  'Every scheduled job and whether it is really working. "active" only means scheduled. FAILING means the MOST RECENT run failed, not that any run ever did. LATE and HUNG are measured against each job''s OWN history, never a fixed number, and a job whose cron restricts the HOUR field is exempt from LATE - it is not overdue, it is asleep. Three earlier versions each mislabelled a different healthy pattern: a fixed two-hour threshold broke on daily jobs, "ever failed" never forgave a recovery, and cadence alone did not understand overnight windows. It does NOT detect SILENT - a job that runs, succeeds and achieves nothing - because that needs knowing what each job is for, and claiming otherwise would be the false green this exists to expose.';

grant select on v_loop_health to authenticated;;
