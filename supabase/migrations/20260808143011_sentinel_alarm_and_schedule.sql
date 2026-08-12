-- A sentinel that nothing calls is the trap all-checks-wired.mjs exists to catch,
-- applied to the database: "a guard written is not a guard running."
create or replace function public.tg_sentinel_sweep()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_run bigint; r record; n integer := 0; problems text := '';
begin
  insert into watchdog_runs default values returning id into v_run;

  for r in select * from f_sentinel_check() where verdict <> 'ok' loop
    n := n + 1;
    problems := problems || r.label || ' (' || r.verdict ||
      case when r.silent_minutes is not null
           then ', silent ' || r.silent_minutes || 'm of ' || r.allowed_minutes || 'm allowed'
           else '' end || '); ';
  end loop;

  if n > 0 then
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run, 'sentinel_source_silent', 'critical',
      n || ' monitored source(s) have STOPPED SPEAKING: ' || rtrim(problems, '; '),
      'sentinel_expectation vs the live run tables', 'Whoever owns the silent job',
      'Since the source last reported',
      'Silence is the failure every other check misses. A dead job reports nothing, and nothing looks exactly like nothing wrong - the Metrc sync was dead for 7 hours 16 minutes on 7 Aug 2026 while every dashboard reported success. This is the only check that treats absence of news as news.',
      'Compared each source''s most recent run against its owner-set max_silence_minutes in sentinel_expectation.',
      'Find why the job stopped. Do NOT simply restart it and close this - a job that died once with no alarm will die again. Record the cause in issue_decisions.',
      rtrim(problems, '; '), n, 'settings', 'sentinel silent dead job heartbeat')
    on conflict (fingerprint) where (fingerprint is not null) do update set
      severity = excluded.severity, what = excluded.what,
      the_arithmetic = excluded.the_arithmetic, record_count = excluded.record_count,
      run_id = excluded.run_id;
  end if;

  return n;
end $$;

comment on function public.tg_sentinel_sweep() is
  'Runs the Sentinel and raises a critical finding for any source that has gone silent. '
  'Scheduled every 15 minutes. Built 8 Aug 2026 from brain/SENTINEL_SPEC.md.';

-- Every 15 minutes: the tightest expectation is the page canary at 120 minutes, so this
-- cannot be the reason a silence is noticed late.
select cron.schedule('sentinel-sweep', '*/15 * * * *', $cron$select public.tg_sentinel_sweep()$cron$)
where not exists (select 1 from cron.job where jobname = 'sentinel-sweep');;
