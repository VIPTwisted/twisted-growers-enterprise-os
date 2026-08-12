-- CAUGHT BY CHECKING MY OWN OUTPUT BEFORE REPORTING IT.
--
-- The previous version told me seven jobs had "never run, and at least two of
-- their scheduled times fall inside the history held". For four of them that is
-- true and serious. For nightly-platform-check, nightly-integrity-check and
-- nightly-role-clearance it is misleading: they are scheduled 06:40-06:55 UTC and
-- were CREATED at 16:26 UTC today. Their scheduled times did pass — before the
-- jobs existed. Reporting those three as broken would be the same mistake as
-- reading a subset of harvests and calling June "100% freezer".
--
-- pg_cron does not record when a job was created, but the migration that
-- scheduled it does: supabase_migrations.schema_migrations.version is a
-- timestamp. Match the job name against the migration text and take the earliest.
-- A job created outside a migration reports null, and null is stated as unknown
-- rather than guessed (A3).
create or replace view v_cron_health as
with hist as (
  select round(extract(epoch from (now() - min(start_time)))/3600.0, 1) as log_hours
  from cron.job_run_details
),
born as (
  select j.jobid,
         (select to_timestamp(min(m.version), 'YYYYMMDDHH24MISS')
          from supabase_migrations.schema_migrations m
          where m.statements::text like '%' || j.jobname || '%'
            and m.statements::text ilike '%cron.schedule%') as created_at
  from cron.job j
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
),
j as (
  select r.*, b.created_at,
         round(extract(epoch from (now() - b.created_at))/3600.0, 1) as age_hours
  from runs r left join born b on b.jobid = r.jobid
)
select
  j.jobname,
  j.schedule,
  j.active,
  j.runs_24h,
  j.failed_24h,
  case when j.runs_24h = 0 then null
       else round(100.0 * j.failed_24h / j.runs_24h, 1) end                       as failure_pct_24h,
  j.last_start   at time zone 'America/New_York'                                  as last_run_et,
  j.last_success at time zone 'America/New_York'                                  as last_success_et,
  case when j.last_success is null then null
       else round(extract(epoch from (now() - j.last_success))/3600.0, 1) end     as hours_since_success,
  case
    when not j.active                          then 'TURNED OFF'
    -- Never run, and too young to have been due. Not a fault.
    when j.runs_ever = 0 and j.age_hours is not null and j.age_hours < 24
         and j.schedule !~ '^\*/'
      then 'TOO NEW TO JUDGE — created ' || j.age_hours
           || ' hours ago and has not come round yet. First run is still ahead of it.'
    when j.runs_ever = 0 and j.schedule ~ '\* \* [0-7]$'
      then 'NOT DUE YET — runs weekly, and no run of it falls inside the '
           || h.log_hours || ' hours of history held'
    when j.runs_ever = 0 and j.schedule ~ '^\*/'
      then 'NEVER RUN — it repeats through the day, so it has had many chances in the '
           || h.log_hours || ' hours of history held. Nothing is purging the log.'
    when j.runs_ever = 0 and h.log_hours >= 48
      then 'NEVER RUN — daily, scheduled since '
           || coalesce(to_char(j.created_at,'DD Mon'), 'a date nobody recorded')
           || ', and at least two of its times fall inside the '
           || h.log_hours || ' hours of history held'
    when j.runs_ever = 0
      then 'NEVER RUN — but the log only covers ' || h.log_hours
           || ' hours, so it may simply not have come round yet'
    when j.last_success is null                then 'NEVER SUCCEEDED — every attempt has failed'
    when j.failed_24h = 0                      then 'HEALTHY'
    when j.failed_24h = j.runs_24h             then 'FAILING EVERY RUN'
    else 'FAILING INTERMITTENTLY — ' || j.failed_24h || ' of ' || j.runs_24h || ' runs in 24h'
  end                                                                             as verdict,
  case
    when not j.active                                                       then 6
    when j.last_success is null and j.last_start is not null                then 1
    when j.failed_24h = j.runs_24h and j.runs_24h > 0                       then 1
    when j.runs_ever = 0 and j.age_hours is not null and j.age_hours < 24
         and j.schedule !~ '^\*/'                                           then 5
    when j.runs_ever = 0 and j.schedule ~ '\* \* [0-7]$'                    then 5
    when j.runs_ever = 0 and (j.schedule ~ '^\*/' or h.log_hours >= 48)     then 2
    when j.runs_ever = 0                                                    then 4
    when j.failed_24h > 0                                                   then 3
    else 5
  end                                                                             as rank,
  left(coalesce(j.last_error, ''), 300)                                           as last_error,
  h.log_hours                                                                     as log_covers_hours,
  j.created_at at time zone 'America/New_York'                                    as scheduled_since_et
from j cross join hist h;

grant select on v_cron_health to authenticated;
revoke all on v_cron_health from anon;;
