/* CORRECTING MY OWN CHECK, an hour after writing it.

   The first version called watchdog-am and watchdog-pm "FAILING and not
   recovered". They are not. They broke on 6-7 August - the watchdog referenced
   v_lab_turnaround_summary, which did not exist then - and have succeeded on
   every run since 8 August. Somebody fixed it.

   The fault was mine: I compared last_success against a FIXED two hours. A daily
   job's last success is ALWAYS older than two hours, so every healthy daily job
   sat one flap away from being called broken. That is precisely the failure this
   view exists to catch, committed by the view itself - and a check that calls a
   working thing broken gets ignored, at which point it is not a check.

   TWO THINGS CHANGE:
     FAILING now means the MOST RECENT run failed - not that any run ever did. A
     job that broke on Tuesday and has worked since is recovered.
     LATE is measured against each job's OWN median gap between successes, times
     two and a half. Nothing here is a threshold I chose.

   I FIRST TRIED TO DROP AND RECREATE THIS, to rename 7d columns to 14d. The
   guard hook blocked it twice, including after I set tg.allow_drop as its own
   message suggests. It is right to hold: a view an hour old is exactly the sort
   of thing that seems safe to drop, and the habit is what costs you later. So
   the window stays at 7 days, matching the column names that already exist, and
   the new column is APPENDED. Truthful names beat a tidy diff. */
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
         when c.usual_gap is not null
              and n.last_success < now() - make_interval(secs => c.usual_gap * 2.5)
              then 'LATE - overdue against its own normal interval'
         when n.last_failure is not null and n.last_failure > n.last_success
              then 'FAILING - its most recent run failed'
         when coalesce(n.failed_7d,0) > 0 then 'recovered - failed earlier, succeeding now'
         else 'healthy'
       end as verdict,
       /* Appended, because a view cannot rename or reorder - only add. */
       round(c.usual_gap)::int  as usual_gap_seconds,
       n.last_failure
from cron.job j
left join norm n    on n.jobid = j.jobid
left join cadence c on c.jobid = j.jobid
left join live l    on l.jobid = j.jobid
order by
  case
    when not j.active then 5
    when coalesce(n.ok_7d,0) = 0 then 0
    when n.last_failure is not null and n.last_failure > n.last_success then 1
    when coalesce(n.failed_7d,0) > 0 then 3
    else 4
  end, j.jobname;

comment on view v_loop_health is
  'Every scheduled job and whether it is really working. "active" only means scheduled. FAILING means the MOST RECENT run failed - not that any run ever did, because a job that broke on Tuesday and has worked since is recovered. LATE and HUNG are measured against each job''s OWN history, never a fixed number: 100 seconds is normal for a matview refresh and alarming for a heartbeat, and a daily job is not late at two hours. The first version used a fixed two hours and mislabelled every healthy daily job, which is the exact failure it exists to find. It does NOT detect SILENT - a job that runs, succeeds and achieves nothing - because that needs knowing what each job is for, and claiming to catch it would be the false green this was written to expose.';

grant select on v_loop_health to authenticated;;
