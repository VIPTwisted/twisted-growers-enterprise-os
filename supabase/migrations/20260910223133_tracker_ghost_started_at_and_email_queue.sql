-- Tracker counted the wrong things. Ghosts used synced_at < finished_at (rows
-- written during the sweep look stale). Alerts counted sent_at is null (resolved
-- + suppressed + in_app). Forever: started_at per licence; email truly queued.

CREATE OR REPLACE FUNCTION public.f_deployment_checks_run()
 RETURNS TABLE(ran integer, failed integer, warned integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int; m int; t timestamptz; s text; v text; d text;
begin
  ---------------------------------------------------------------- SYNC LIVENESS
  select count(*) into n from metrc_scan_log where triggered_at::date = current_date;
  select count(*) into m from metrc_sync_runs  where started_at::date  = current_date;
  s := case when n = 0 then 'N/A' when m = 0 then 'FAIL'
            when m < n then 'WARN' else 'PASS' end;
  perform f_deployment_check_record('sync.dispatch_vs_runs', s,
    n || ' dispatched / ' || m || ' runs',
    case when m = 0 and n > 0 then 'DISPATCHED BUT NOTHING RAN. This is the 504 signature - the worker is not executing.'
         when m < n then 'Fewer runs than dispatches. Some jobs are not reaching the worker.'
         else 'Every dispatch produced at least one run.' end);

  ---------------------------------------------------------------- MIRROR FRESHNESS
  select max(synced_at) into t from metrc_packages;
  n := round(extract(epoch from (now() - t)) / 3600.0);
  s := case when n <= 4 then 'PASS' when n <= 12 then 'WARN' else 'FAIL' end;
  perform f_deployment_check_record('sync.packages_fresh', s, n || ' h ago',
    'metrc_packages last changed ' || coalesce(t::timestamp(0)::text,'never')
    || '. Packages drive on-hand, valuation and every money tile.');

  select updated_at into t from configurations where key = 'metrc_sync_cursors';
  n := round(extract(epoch from (now() - t)) / 3600.0);
  s := case when n <= 4 then 'PASS' when n <= 12 then 'WARN' else 'FAIL' end;
  perform f_deployment_check_record('sync.cursors_advancing', s, n || ' h ago',
    'A held cursor is correct behaviour for one failed run. A cursor that has not '
    || 'moved in hours means no run has completed.');

  select (value->>'ms')::int into n from configurations where key = 'metrc_sync_soft_deadline_ms';
  s := case when n is null then 'WARN' when n < 150000 then 'PASS' else 'FAIL' end;
  perform f_deployment_check_record('sync.deadline_under_gateway', s, coalesce(n::text,'unset') || ' ms',
    'Supabase gateway kills an idle request at 150000 ms. A soft deadline at or above '
    || 'that can never fire, so the worker is killed before it can close its run.');

  select count(*) into n from apex_raw where fetched_at::date = current_date;
  s := case when n > 0 then 'PASS' else 'WARN' end;
  perform f_deployment_check_record('sync.apex_fresh', s, n || ' rows today',
    'Apex is the source of record for money. Zero rows today is not proof of failure '
    || '- reference entities run on a slower cadence - but it needs a look.');

  ---------------------------------------------------------------- STALE ON-HAND
  /* Ghost = same-licence active row whose synced_at is before that licence's
     latest completed packages full sweep STARTED. finished_at is wrong: rows
     written during the sweep have synced_at between start and finish and are
     Metrc-confirmed. Other-licence inactive is a transfer origin, not a finish. */
  if not exists (
    select 1 from metrc_sync_runs
     where endpoint like 'packages (full sweep)%' and status = 'ok' and finished_at is not null
  ) then
    perform f_deployment_check_record('mirror.stale_active_packages','N/A','no full sweep',
      'No completed packages full sweep on record, so stale actives cannot be measured.');
  else
    select count(*)::int,
           round(sum(case when p.uom='g' then p.quantity else 0 end)::numeric/453.592, 1)::int
      into n, m
      from metrc_packages p
      join (
        select distinct on (license) license, started_at
          from metrc_sync_runs
         where endpoint like 'packages (full sweep)%' and status = 'ok' and finished_at is not null
         order by license, finished_at desc
      ) l on l.license = p.license
     where p.source_state = 'active' and p.synced_at < l.started_at;
    s := case when coalesce(n,0) = 0 then 'PASS' when n <= 5 then 'WARN' else 'FAIL' end;
    perform f_deployment_check_record('mirror.stale_active_packages', s,
      coalesce(n,0) || ' tags / ' || coalesce(m,0) || ' lb',
      'Active on this licence and untouched when that licence''s last packages full sweep started. Unique key is (license, tag). Other-licence inactive is a transfer origin, not a finish.');
  end if;

  select count(*), count(distinct tag) into n, m from metrc_packages;
  s := case when n = m then 'PASS' else 'WARN' end;
  perform f_deployment_check_record('mirror.package_tag_dupes', s,
    n || ' rows / ' || m || ' tags',
    'A tag arriving by both "metrc api" and "metrc report" gets two rows. count(*) is '
    || 'a row count, never a package count - always count(distinct tag).');

  ---------------------------------------------------------------- ALERT DELIVERY
  /* Truly queued for EMAIL. sent_at is null includes resolved, suppressed, and
     in_app. Scope is sync_failures_only; non-digest rows are suppressed on insert. */
  select count(*) into n from alert_outbox
   where channel = 'email'
     and sent_at is null and dispatched_at is null
     and resolved_at is null and email_suppressed_at is null;
  select max(sent_at) into t from alert_outbox;
  s := case when n = 0 then 'PASS' when n < 50 then 'WARN' else 'FAIL' end;
  perform f_deployment_check_record('alerts.undelivered', s, n || ' queued for email',
    'Truly queued for email = channel email and sent_at, dispatched_at, resolved_at, email_suppressed_at all null. '
    || 'Last alert actually sent: ' || coalesce(t::timestamp(0)::text,'NEVER')
    || '. Scope is sync_failures_only. In-app rows are not undelivered email.');

  select count(*) into n from alert_recipient where active;
  s := case when n >= 2 then 'PASS' when n = 1 then 'WARN' else 'FAIL' end;
  perform f_deployment_check_record('alerts.recipients', s, n || ' active',
    'Roles used by rules (hr, employee, manager) must resolve to a real destination '
    || 'or their alerts are raised into nothing.');

  ---------------------------------------------------------------- SCHEDULED JOBS
  select count(distinct j.jobname) into n
    from cron.job_run_details r join cron.job j on j.jobid = r.jobid
   where r.start_time::date = current_date and r.status <> 'succeeded';
  s := case when n = 0 then 'PASS' when n <= 2 then 'WARN' else 'FAIL' end;
  select string_agg(distinct j.jobname, ', ') into d
    from cron.job_run_details r join cron.job j on j.jobid = r.jobid
   where r.start_time::date = current_date and r.status <> 'succeeded';
  perform f_deployment_check_record('cron.failures_today', s, n || ' jobs failing',
    coalesce(d, 'none'));

  ---------------------------------------------------------------- PEOPLE / CCC
  select count(*) into n from employees
   where status::text <> 'active' and metrc_license_status = 'Active';
  s := case when n = 0 then 'PASS' when n <= 2 then 'WARN' else 'FAIL' end;
  perform f_deployment_check_record('hr.leavers_live_badge', s, n || ' people',
    'We say they left; Metrc says their Cannabis Agent Registration is Active. '
    || 'Either a former employee can still legally handle product, or the roster is wrong.');

  select count(*) into n from employees
   where status::text = 'active' and badge_expires < current_date;
  s := case when n = 0 then 'PASS' else 'FAIL' end;
  perform f_deployment_check_record('hr.active_expired_badge', s, n || ' people',
    'Owner ruling 10 Sep 2026: an expired badge means they are no longer employed. '
    || 'Anything here is a contradiction with that rule.');

  select count(*) into n from v_employee_lifecycle_gap where gap <> 'ok';
  s := case when n = 0 then 'PASS' when n <= 5 then 'WARN' else 'FAIL' end;
  perform f_deployment_check_record('hr.lifecycle_gaps', s, n || ' records',
    'Leavers with no offboarding record, no last day, or a status that contradicts itself.');

  select count(*) into n from employees
   where status::text = 'active' and primary_department_id is null;
  s := case when n = 0 then 'PASS' when n <= 3 then 'WARN' else 'FAIL' end;
  perform f_deployment_check_record('hr.no_department', s, n || ' people',
    'Active staff with no department. Department headcount will not sum to the roster '
    || 'and no room on the map can show them.');

  ---------------------------------------------------------------- CULTIVATION
  select count(*) into n from (
    select room, count(distinct tag) c from metrc_plants
     where source_state in ('flowering','vegetative') and room like 'Flower Room%'
     group by room
  ) z where (room in ('Flower Room #1','Flower Room #3') and c <> 1140)
        or (room in ('Flower Room #2','Flower Room #4') and c <> 1050);
  s := case when n = 0 then 'PASS' else 'WARN' end;
  select string_agg(room || '=' || c, ' · ' order by room) into d from (
    select room, count(distinct tag) c from metrc_plants
     where source_state in ('flowering','vegetative') and room like 'Flower Room%'
     group by room) z;
  perform f_deployment_check_record('plants.room_caps', s,
    coalesce(d,'no rooms'),
    'Caps are F1/F3 1,140 and F2/F4 1,050 from conversion_factors. 1,150 is the '
    || 'Labor Calculator crew-sizing figure and is NOT a room capacity.');

  ---------------------------------------------------------------- DEPLOY DRIFT
  select count(*) into n from departments where name ilike '%cheap%';
  s := case when n = 0 then 'PASS' else 'WARN' end;
  perform f_deployment_check_record('naming.economy_prerolls', s, n || ' departments',
    'Owner rule: Economy Pre-Rolls, never "Cheap". This measures departments.name, '
    || 'not just the alias file.');

  return query
    select (select count(*)::int from deployment_check where active and kind='auto' and last_run_at > now() - interval '5 min'),
           (select count(*)::int from deployment_check where active and status='FAIL'),
           (select count(*)::int from deployment_check where active and status='WARN');
end $function$;
