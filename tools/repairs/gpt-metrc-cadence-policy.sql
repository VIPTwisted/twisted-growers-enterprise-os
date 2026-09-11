-- GPT: Metrc operational-feed cadence policy. Configuration DML only.
-- Retains business data, run evidence, cursors, unrelated policy and paused states.
begin;
set local application_name = 'gpt_metrc_cadence_policy';
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $repair$
declare v_job bigint; v_count integer; v_after jsonb; v_times jsonb;
  v_before jsonb := $policy$[{"job_name":"manifests","endpoints":"transfers","run_times":["08:00:00","09:00:00","10:00:00","11:00:00","12:00:00","13:00:00","14:00:00","15:00:00","16:00:00","17:00:00"],"timezone":"America/New_York","min_gap_minutes":15},{"job_name":"cultivation","endpoints":"plants,harvests,plantbatches","run_times":["08:00:00","09:00:00","10:00:00","11:00:00","12:00:00","13:00:00","14:00:00","15:00:00","16:00:00","17:00:00"],"timezone":"America/New_York","min_gap_minutes":15},{"job_name":"packages","endpoints":"packages","run_times":["08:00:00","09:00:00","10:00:00","11:00:00","12:00:00","13:00:00","14:00:00","15:00:00","16:00:00","17:00:00"],"timezone":"America/New_York","min_gap_minutes":15}]$policy$::jsonb;
begin
  select jsonb_agg(to_char(time '00:00' + n * interval '10 minutes','HH24:MI:SS') order by n)
    into v_times from generate_series(0,143) n;
  select jsonb_agg(jsonb_set(e,'{run_times}',v_times)) into v_after
    from jsonb_array_elements(v_before) e;
  if not pg_try_advisory_xact_lock(hashtextextended('gpt_metrc_cadence',0)) then
    raise exception 'Another cadence repair owns this transaction';
  end if;
  perform 1 from public.metrc_scan_schedule where job_name in ('packages','manifests','cultivation') order by job_name for update;
  select count(*) into v_count from public.metrc_scan_schedule s
    join jsonb_populate_recordset(null::public.metrc_scan_schedule,v_before) e using(job_name)
    where s.endpoints=e.endpoints and s.run_times=e.run_times and s.timezone=e.timezone
      and s.min_gap_minutes=e.min_gap_minutes;
  if v_count<>3 then raise exception 'Metrc cadence policy changed; inspect before policy'; end if;
  select jobid into strict v_job from cron.job
    where jobname='metrc-dispatcher' and schedule='*/15 * * * *'
      and command='select tg_metrc_dispatch()' and database=current_database();
  update public.metrc_scan_schedule s set run_times=e.run_times
    from jsonb_populate_recordset(null::public.metrc_scan_schedule,v_after) e
    where s.job_name=e.job_name;
  get diagnostics v_count=row_count;
  if v_count<>3 then raise exception 'Expected exactly three schedule updates'; end if;
  perform cron.alter_job(v_job,schedule := '*/5 * * * *');
  if not exists(select 1 from cron.job where jobid=v_job and schedule='*/5 * * * *') then
    raise exception 'Dispatcher schedule was not saved';
  end if;
end
$repair$;
commit;
