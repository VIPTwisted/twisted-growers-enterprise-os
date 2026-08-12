CREATE OR REPLACE FUNCTION public.tg_nightly_platform_check()
 RETURNS TABLE(invariant text, expected text, actual text, verdict text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run bigint;
  v_tables int; v_views int; v_mv int; v_mv_bad int; v_cron int; v_cron_bad int;
  v_cron_bad_24h int; v_cron_names text;
  v_nav int; v_nav_broken int; v_pol int; v_no_rls int;
  v_anon_rel int; v_anon_fn int; v_anon_wr int; v_mutable int;
  v_oq int; v_gl int; v_tiles int; v_no_target int; v_users int; v_emps int;
begin
  select count(*) into v_tables from pg_tables where schemaname='public';
  select count(*) into v_views  from pg_views  where schemaname='public';
  select count(*) into v_mv     from pg_matviews where schemaname='public';
  select count(*) into v_mv_bad from pg_matviews where schemaname='public' and not ispopulated;
  select count(*) into v_cron   from cron.job;

  /* CORRECTED 8 Aug 2026: only a genuinely FAILED latest run counts. This previously read
     d.status <> 'succeeded', which counted every job that happened to be mid-flight at the
     instant of the snapshot. The 06:40 run is exactly when the nightly jobs cluster, so it
     reported 8 jobs failing when none had failed. */
  select count(*) into v_cron_bad from cron.job j
    join (select jobid, max(start_time) mt from cron.job_run_details group by 1) l on l.jobid=j.jobid
    join cron.job_run_details d on d.jobid=j.jobid and d.start_time=l.mt
    where d.status = 'failed';

  /* ADDED 8 Aug 2026 — the worse half. The old check only ever inspected each job's LATEST
     run, so refresh-tower-inventory timing out on 7 of 48 runs read as healthy every time
     its most recent run happened to pass. */
  select count(distinct j.jobname), string_agg(distinct j.jobname, ', ')
    into v_cron_bad_24h, v_cron_names
  from cron.job j
  join cron.job_run_details d on d.jobid=j.jobid
  where d.status='failed' and d.start_time > now() - interval '24 hours';
  v_cron_bad_24h := coalesce(v_cron_bad_24h, 0);

  select count(*) into v_nav from nav_registry where enabled;
  select count(*) into v_nav_broken from nav_registry nr
    where nr.enabled and coalesce(nr.table_ref,'') <> ''
      and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                      where n.nspname='public' and c.relname=nr.table_ref and c.relkind in ('r','v','m'));
  select count(*) into v_pol from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public';
  select count(*) into v_no_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
  select count(*) into v_anon_rel from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v','m') and has_table_privilege('anon',c.oid,'SELECT');
  select count(*) into v_anon_fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE')
      and not exists (select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e');
  select count(*) into v_anon_wr from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')
      and not exists (select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e')
      and pg_get_functiondef(p.oid) ~* '(insert into|update |delete from|refresh materialized)';
  select count(*) into v_mutable from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.proconfig is null
      and not exists (select 1 from pg_depend d where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e');
  select count(*) into v_oq from open_questions where coalesce(answer,'') = '';
  select count(*) into v_gl from golive_items where coalesce(status::text,'') not in ('done','complete','closed');
  select count(*) into v_tiles from mv_department_dashboard;
  select greatest(v_tiles - (select count(*) from kpi_targets), 0) into v_no_target;
  select count(*) into v_users from app_users;
  select count(*) into v_emps from employees where status::text = 'active';

  insert into platform_state (base_tables, views, matviews, matviews_unpopulated, cron_jobs,
    cron_failing, cron_failing_24h, nav_enabled, nav_broken, policies, tables_without_rls,
    anon_relations, anon_functions, anon_writing_functions, secdef_mutable_path,
    open_questions_unanswered, golive_open, tiles_total, tiles_without_target, app_users,
    active_employees, notes)
  values (v_tables, v_views, v_mv, v_mv_bad, v_cron, v_cron_bad, v_cron_bad_24h, v_nav,
    v_nav_broken, v_pol, v_no_rls, v_anon_rel, v_anon_fn, v_anon_wr, v_mutable, v_oq, v_gl,
    v_tiles, v_no_target, v_users, v_emps, 'tg_nightly_platform_check');

  insert into watchdog_runs default values returning id into v_run;

  if v_anon_rel > 0 or v_anon_fn > 0 then
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run, 'anon_surface_reopened', 'critical',
      'Anonymous access has reopened: '||v_anon_rel||' relation(s) and '||v_anon_fn||' function(s) reachable without signing in',
      'The public schema, over the REST API', 'Whoever created the object, and the watchdog',
      'Since the object was created',
      'anon is every anonymous visitor - the publishable key ships in the JavaScript bundle, so anything anon can reach is effectively public. On 7 Aug 2026 this exposed customers, manifests and wholesale figures, and 33 functions that write.',
      'The nightly platform check counted objects anon holds SELECT or EXECUTE on, excluding extension-owned functions.',
      'Revoke from PUBLIC as well as anon - revoking from anon alone is a no-op while PUBLIC holds the privilege. Then run supabase/checks/anon_exposure.sql to confirm zero.',
      'anon relations '||v_anon_rel||', anon functions '||v_anon_fn||', of which writing '||v_anon_wr,
      v_anon_rel + v_anon_fn, 'settings', 'anon exposure security')
    on conflict (fingerprint) where (fingerprint is not null) do update set
      severity=excluded.severity, what=excluded.what, the_arithmetic=excluded.the_arithmetic,
      record_count=excluded.record_count, run_id=excluded.run_id;
  end if;

  if v_no_rls > 0 then
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run, 'tables_without_rls', 'critical',
      v_no_rls||' public table(s) have row-level security switched off',
      'The public schema', 'Whoever created the table', 'Since the table was created',
      'A table with RLS off is protected only by its privileges. New tables arrive with RLS off by default, so this happens by omission - on 7 Aug it left the flag-decision record open to forgery by any signed-in user.',
      'The nightly platform check counted tables where relrowsecurity is false.',
      'alter table <name> enable row level security, then mirror an existing sibling: read for authenticated, write for owner or executive.',
      v_no_rls||' table(s)', v_no_rls, 'settings', 'rls disabled security')
    on conflict (fingerprint) where (fingerprint is not null) do update set
      severity=excluded.severity, what=excluded.what, the_arithmetic=excluded.the_arithmetic,
      record_count=excluded.record_count, run_id=excluded.run_id;
  end if;

  if v_nav_broken > 0 then
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run, 'nav_points_at_missing_relation', 'elevated',
      v_nav_broken||' menu item(s) point at a view or table that does not exist',
      'nav_registry', 'Whoever dropped or renamed the relation', 'Since it was dropped or renamed',
      'The page renders empty rather than erroring, so it looks like there is no data when the page is broken. Laboratory Turnaround pointed at a view that never existed and was blank from the day it was built.',
      'The nightly platform check joined every enabled nav_registry.table_ref to pg_class.',
      'Repoint the entry at the real relation, or disable it until the view exists.',
      v_nav_broken||' of '||v_nav||' enabled entries', v_nav_broken, 'settings', 'nav broken missing view')
    on conflict (fingerprint) where (fingerprint is not null) do update set
      severity=excluded.severity, what=excluded.what, the_arithmetic=excluded.the_arithmetic,
      record_count=excluded.record_count, run_id=excluded.run_id;
  end if;

  /* ADDED 8 Aug 2026. The check recorded a cron number and raised nothing, so an
     intermittently failing job produced no finding and no owner ever saw it. */
  if v_cron_bad_24h > 0 then
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run, 'cron_jobs_failing', 'elevated',
      v_cron_bad_24h||' scheduled job(s) failed at least once in the last 24 hours: '||coalesce(v_cron_names,'unknown'),
      'cron.job_run_details', 'Whoever owns the job',
      'First failure inside the last 24 hours',
      'These jobs refresh dashboards, reconcile stock and record lab turnarounds. A job that fails intermittently leaves figures quietly stale rather than visibly broken, so nobody notices. refresh-tower-inventory timed out on 7 of 48 runs on 7-8 Aug 2026 and the old check called it healthy every time, because it only ever inspected the most recent run.',
      'Counted distinct jobs with a run of status failed inside 24 hours, rather than only the latest run of each job.',
      'Read the return_message on the failed runs. A statement timeout means the job needs its query optimised or its statement_timeout raised - not a retry.',
      v_cron_bad_24h||' job(s) failing intermittently; '||v_cron_bad||' currently failing on their latest run, of '||v_cron||' scheduled',
      v_cron_bad_24h, 'settings', 'cron job failing scheduled timeout')
    on conflict (fingerprint) where (fingerprint is not null) do update set
      severity=excluded.severity, what=excluded.what, the_arithmetic=excluded.the_arithmetic,
      record_count=excluded.record_count, run_id=excluded.run_id;
  end if;

  return query
  select 'anon-readable relations','0',v_anon_rel::text, case when v_anon_rel=0 then 'PASS' else 'FAIL' end union all
  select 'anon-executable functions','0',v_anon_fn::text, case when v_anon_fn=0 then 'PASS' else 'FAIL' end union all
  select 'anon functions that WRITE','0',v_anon_wr::text, case when v_anon_wr=0 then 'PASS' else 'FAIL' end union all
  select 'tables without RLS','0',v_no_rls::text, case when v_no_rls=0 then 'PASS' else 'FAIL' end union all
  select 'SECDEF with mutable search_path','0',v_mutable::text, case when v_mutable=0 then 'PASS' else 'FAIL' end union all
  select 'nav entries pointing nowhere','0',v_nav_broken::text, case when v_nav_broken=0 then 'PASS' else 'FAIL' end union all
  select 'matviews unpopulated','0',v_mv_bad::text, case when v_mv_bad=0 then 'PASS' else 'FAIL' end union all
  select 'cron jobs failing right now','0',v_cron_bad::text, case when v_cron_bad=0 then 'PASS' else 'WATCH' end union all
  select 'cron jobs failing in last 24h','0',v_cron_bad_24h::text, case when v_cron_bad_24h=0 then 'PASS' else 'WATCH' end union all
  select 'tiles with no owner-set target','0',v_no_target::text, case when v_no_target=0 then 'PASS' else 'WATCH' end union all
  select 'unanswered owner questions','0',v_oq::text, case when v_oq=0 then 'PASS' else 'WATCH' end union all
  select 'staff without an account','0',greatest(v_emps-v_users,0)::text, case when v_emps-v_users<=0 then 'PASS' else 'WATCH' end;
end $function$;;
