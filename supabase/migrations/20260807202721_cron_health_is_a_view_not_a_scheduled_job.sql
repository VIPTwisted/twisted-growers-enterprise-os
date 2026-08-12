-- THE DEFECT THIS CLOSES
--
-- `refresh-tower-inventory` failed 10 of its last 20 runs on a statement timeout.
-- `watchdog-am` has failed EVERY run it has ever attempted, on two different errors.
-- Eight more jobs are active and have never produced a single run row.
--
-- None of that reached a person. Nothing in this database reads
-- cron.job_run_details except `tg_nightly_platform_check` — which is itself a cron
-- job (`nightly-platform-check`, 06:40) that HAS NEVER RUN. The only watcher of the
-- schedule is scheduled, so when the schedule breaks the watcher breaks with it.
--
-- So this is a VIEW, deliberately. A view has no schedule to miss, no worker to die
-- and no notification channel to be unconfigured. It is computed at the instant
-- somebody looks, which is the one moment it matters.
--
-- verdict is ranked so `order by rank` puts the worst first without the caller
-- needing to know the vocabulary.
create or replace view v_cron_health as
with runs as (
  select j.jobid, j.jobname, j.schedule, j.active,
         count(d.runid) filter (where d.start_time > now() - interval '24 hours') as runs_24h,
         count(d.runid) filter (where d.start_time > now() - interval '24 hours'
                                  and d.status <> 'succeeded')                     as failed_24h,
         max(d.start_time)                                                          as last_start,
         max(d.start_time) filter (where d.status = 'succeeded')                    as last_success,
         (array_agg(d.return_message order by d.start_time desc)
            filter (where d.status <> 'succeeded'))[1]                              as last_error
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
  group by j.jobid, j.jobname, j.schedule, j.active
)
select
  jobname,
  schedule,
  active,
  runs_24h,
  failed_24h,
  case when runs_24h = 0 then null
       else round(100.0 * failed_24h / runs_24h, 1) end                     as failure_pct_24h,
  last_start   at time zone 'America/New_York'                              as last_run_et,
  last_success at time zone 'America/New_York'                              as last_success_et,
  case when last_success is null then null
       else round(extract(epoch from (now() - last_success)) / 3600.0, 1) end as hours_since_success,
  -- A3: absence is never a blank. Every state says which state it is and why.
  case
    when not active                     then 'TURNED OFF'
    when last_start is null             then 'NEVER RUN — active, scheduled, no run has ever been recorded'
    when last_success is null           then 'NEVER SUCCEEDED — every attempt has failed'
    when failed_24h = 0                 then 'HEALTHY'
    when failed_24h = runs_24h          then 'FAILING EVERY RUN'
    else 'FAILING INTERMITTENTLY — ' || failed_24h || ' of ' || runs_24h || ' runs in 24h'
  end                                                                        as verdict,
  case
    when not active                     then 5
    when last_success is null and last_start is not null then 1
    when last_start is null             then 3
    when failed_24h = runs_24h and runs_24h > 0 then 1
    when failed_24h > 0                 then 2
    else 4
  end                                                                        as rank,
  -- The message is the whole diagnosis. Truncated, because some are a page long.
  left(coalesce(last_error, ''), 300)                                        as last_error
from runs;

comment on view v_cron_health is
  'Health of every pg_cron job, computed on read. Deliberately not a scheduled job: the only existing watcher of the schedule (tg_nightly_platform_check) is itself scheduled and has never run. order by rank, jobname.';

grant select on v_cron_health to authenticated;
revoke all on v_cron_health from anon;;
