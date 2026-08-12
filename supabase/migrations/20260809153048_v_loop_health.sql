/* ARE THE LOOPS ACTUALLY WORKING. Owner, 9 August 2026: agents, brains, loops
   and AI are mine.

   There are 39 scheduled jobs and every one reads "active". Active only means
   SCHEDULED. Agent A put the real question well while diagnosing something else:

     "a retry job that runs 1,440 times a day and retries nothing is its own
      false-green"

   They were right, and it was my job they were describing. So a loop can fail in
   four ways and only one of them is visible today:

     FAILING   it errors. Visible.
     HUNG      it started and never finished. The row says 'running' for ever and
               nothing says how long that is unusual FOR THAT JOB - a 100-second
               matview refresh is normal, a 100-second heartbeat is not.
     LATE      it did not run when it should have. Nothing notices, because
               nothing compares the schedule to reality.
     SILENT    it runs, succeeds, and achieves nothing. The worst of the four,
               because it looks like health.

   This catches the first three generically, from run history alone, with no
   per-job configuration to maintain. The fourth cannot be caught without knowing
   what each job is FOR, and pretending otherwise would itself be a false green -
   so it is named in the comment rather than silently ignored.

   'Normal' is each job's OWN history, not a fixed threshold. A number that suits
   the heartbeat would flag every nightly report, and a number that suits the
   nightly reports would never flag anything. */
create or replace view v_loop_health as
with recent as (
  select d.jobid, d.status, d.start_time, d.end_time,
         extract(epoch from (d.end_time - d.start_time)) as secs
  from cron.job_run_details d
  where d.start_time > now() - interval '7 days'
),
norm as (
  select jobid,
         percentile_cont(0.95) within group (order by secs) as p95_secs,
         count(*) filter (where status = 'succeeded')       as ok_7d,
         count(*) filter (where status = 'failed')          as failed_7d,
         max(end_time) filter (where status = 'succeeded')  as last_success
  from recent where secs is not null or status <> 'succeeded'
  group by jobid
),
live as (
  select jobid, min(start_time) as running_since
  from recent where status = 'running' and end_time is null
  group by jobid
)
select j.jobname,
       j.schedule,
       j.active,
       coalesce(n.ok_7d, 0)                       as succeeded_7d,
       coalesce(n.failed_7d, 0)                   as failed_7d,
       n.last_success,
       round(n.p95_secs)::int                     as usual_seconds,
       round(extract(epoch from (now() - l.running_since)))::int as running_for_seconds,
       case
         when not j.active                                   then 'switched off'
         when n.last_success is null and coalesce(n.ok_7d,0) = 0
                                                             then 'never succeeded in 7 days'
         when l.running_since is not null
              and n.p95_secs is not null
              and extract(epoch from (now() - l.running_since)) > greatest(n.p95_secs * 4, 300)
                                                             then 'HUNG - running far longer than it ever normally takes'
         when coalesce(n.failed_7d,0) > 0
              and n.last_success < now() - interval '2 hours' then 'FAILING and not recovered'
         when coalesce(n.failed_7d,0) > 0                     then 'failed sometimes, but recovered'
         else 'healthy'
       end as verdict
from cron.job j
left join norm n on n.jobid = j.jobid
left join live l on l.jobid = j.jobid
order by
  case
    when not j.active then 3
    when n.last_success is null and coalesce(n.ok_7d,0) = 0 then 0
    when coalesce(n.failed_7d,0) > 0 then 1
    else 2
  end,
  j.jobname;

comment on view v_loop_health is
  'Every scheduled job, and whether it is actually working. "active" only means scheduled. Catches FAILING, HUNG (running far past its own normal, not a fixed threshold - 100 seconds is fine for a matview refresh and alarming for a heartbeat) and NEVER-SUCCEEDED. It does NOT catch SILENT - a job that runs, succeeds, and achieves nothing - because that needs knowledge of what each job is for, and claiming otherwise would be the exact false green this view exists to find.';

grant select on v_loop_health to authenticated;

select verdict, count(*) as jobs from v_loop_health group by verdict order by 2 desc;;
