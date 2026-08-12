-- "NEVER RUN" on its own is ambiguous and the ambiguity is dangerous in both
-- directions. `forensic-audit` is weekly on a Monday and was created on a
-- Wednesday — it is not late, it is not due. `metrc-documents-backfill` runs
-- every 15 minutes from midnight to 09:00 and has had roughly 72 opportunities
-- in the 53 hours the log covers, with zero rows. Reading those two the same way
-- either raises a false alarm or buries a real one.
--
-- So the view states how much history exists and whether the job's own schedule
-- should have produced a run inside it. Weekly jobs are called out rather than
-- judged, because a cron expression is not something to half-parse.
--
-- E1: CREATE OR REPLACE, and the new column is APPENDED — Postgres will not let a
-- replace reorder or rename, which is the guard rail that stops a "small tidy-up"
-- from silently changing what a caller reads.
create or replace view v_cron_health as
with hist as (
  select round(extract(epoch from (now() - min(start_time)))/3600.0, 1) as log_hours
  from cron.job_run_details
),
runs as (
  select j.jobid, j.jobname, j.schedule, j.active,
         count(d.runid) filter (where d.start_time > now() - interval '24 hours') as runs_24h,
         count(d.runid) filter (where d.start_time > now() - interval '24 hours'
                                  and d.status <> 'succeeded')                     as failed_24h,
         count(d.runid)                                                            as runs_ever,
         max(d.start_time)                                                          as last_start,
         max(d.start_time) filter (where d.status = 'succeeded')                    as last_success,
         (array_agg(d.return_message order by d.start_time desc)
            filter (where d.status <> 'succeeded'))[1]                              as last_error
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
  group by j.jobid, j.jobname, j.schedule, j.active
)
select
  r.jobname,
  r.schedule,
  r.active,
  r.runs_24h,
  r.failed_24h,
  case when r.runs_24h = 0 then null
       else round(100.0 * r.failed_24h / r.runs_24h, 1) end                       as failure_pct_24h,
  r.last_start   at time zone 'America/New_York'                                  as last_run_et,
  r.last_success at time zone 'America/New_York'                                  as last_success_et,
  case when r.last_success is null then null
       else round(extract(epoch from (now() - r.last_success))/3600.0, 1) end     as hours_since_success,
  case
    when not r.active                          then 'TURNED OFF'
    when r.runs_ever = 0 and r.schedule ~ '\* \* [0-7]$'
      then 'NOT DUE YET — runs weekly, and no run of it falls inside the '
           || h.log_hours || ' hours of history held'
    when r.runs_ever = 0 and r.schedule ~ '^\*/'
      then 'NEVER RUN — it repeats through the day, so it has had many chances in the '
           || h.log_hours || ' hours of history held. Nothing is purging the log.'
    when r.runs_ever = 0 and h.log_hours >= 48
      then 'NEVER RUN — daily, and at least two of its scheduled times fall inside the '
           || h.log_hours || ' hours of history held'
    when r.runs_ever = 0
      then 'NEVER RUN — but the log only covers ' || h.log_hours
           || ' hours, so it may simply not have come round yet'
    when r.last_success is null                then 'NEVER SUCCEEDED — every attempt has failed'
    when r.failed_24h = 0                      then 'HEALTHY'
    when r.failed_24h = r.runs_24h             then 'FAILING EVERY RUN'
    else 'FAILING INTERMITTENTLY — ' || r.failed_24h || ' of ' || r.runs_24h || ' runs in 24h'
  end                                                                             as verdict,
  case
    when not r.active                                            then 6
    when r.last_success is null and r.last_start is not null     then 1
    when r.failed_24h = r.runs_24h and r.runs_24h > 0            then 1
    when r.runs_ever = 0 and r.schedule ~ '\* \* [0-7]$'         then 5
    when r.runs_ever = 0 and (r.schedule ~ '^\*/' or h.log_hours >= 48) then 2
    when r.runs_ever = 0                                         then 4
    when r.failed_24h > 0                                        then 3
    else 5
  end                                                                             as rank,
  left(coalesce(r.last_error, ''), 300)                                           as last_error,
  h.log_hours                                                                     as log_covers_hours
from runs r cross join hist h;

comment on view v_cron_health is
  'Health of every pg_cron job, computed on read. Deliberately not a scheduled job: the only existing watcher of the schedule (tg_nightly_platform_check) is itself scheduled and has never run. A job that has never run says whether it was ever due. order by rank, jobname.';

grant select on v_cron_health to authenticated;
revoke all on v_cron_health from anon;;
