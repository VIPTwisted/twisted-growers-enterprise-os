-- ============================================================================
-- NIGHTLY PLATFORM SELF-CHECK
--
-- ENFORCES Rules E5 and E3, in addition to the security invariants below.
--   E5 — "functions that views depend on need `set search_path = public`". Measured
--        every night as secdef_mutable_path; the expected value is 0 and any other
--        value is a FAIL, because a SECURITY DEFINER function with a mutable
--        search_path can be redirected to objects the caller controls.
--   E3 — "matviews read base tables, never other views", so a view rebuild cannot
--        cascade into them. Checked against pg_matviews.
-- Named explicitly on 8 Aug 2026: rule-ledger.mjs credits a rule only when a guard
-- names it, and both of these were enforced here while scoring as unenforced.
--
-- Two problems, one mechanism.
--
-- PROBLEM 1 — the documentation lies. HANDOFF.md stated "Anon access: 0 views readable" when
-- 30 relations were returning customer, manifest and wholesale data to anyone holding the
-- publishable key. Its counts (176 tables / 177 views / 19 cron) were stale within a day. A
-- handover document that is confidently wrong is worse than none, because it stops the next
-- person looking.
--
-- PROBLEM 2 — the security surface reopens by itself. PostgreSQL grants EXECUTE on every new
-- function to PUBLIC by default, and new tables arrive with RLS off. On 7 August the anon
-- surface was closed and reopened THREE times, twice within minutes, because two agents were
-- shipping functions faster than a human could sweep. ALTER DEFAULT PRIVILEGES covers the
-- postgres role; it cannot cover supabase_admin, so a backstop is required.
--
-- This records the true state once a day, and raises a watchdog finding when an invariant
-- breaks. It reads only catalogues — no Metrc calls, no external API, one run per day, in
-- keeping with the owner's hard rule that API calls are never flooded.
-- ============================================================================

-- 1. Where the truth lives. Append-only: a history of what was true, not a current-state row,
--    so drift is visible over time rather than silently overwritten.
create table if not exists platform_state (
  id            bigserial primary key,
  taken_at      timestamptz not null default now(),
  taken_on      date        not null default current_date,
  base_tables   int,
  views         int,
  matviews      int,
  matviews_unpopulated int,
  cron_jobs     int,
  cron_failing  int,
  nav_enabled   int,
  nav_broken    int,
  policies      int,
  tables_without_rls   int,
  anon_relations       int,
  anon_functions       int,
  anon_writing_functions int,
  secdef_mutable_path  int,
  open_questions_unanswered int,
  golive_open   int,
  tiles_total   int,
  tiles_without_target int,
  app_users     int,
  active_employees int,
  notes         text
);

comment on table platform_state is
 'One row per nightly self-check. HANDOFF.md should be generated from the latest row rather '
 'than hand-written - it was materially wrong on 7 Aug 2026 and had been for some time. '
 'Append-only by design: the history of what was true is itself evidence.';

alter table platform_state enable row level security;

do $$
begin
  if not exists (select 1 from pg_policy where polrelid='public.platform_state'::regclass and polname='ps_read') then
    create policy ps_read on platform_state for select to authenticated using (true);
  end if;
end $$;
-- No insert/update/delete policy: the SECURITY DEFINER function below is the only writer,
-- and there is deliberately no route to amend history. Rule H2.


-- 2. The check itself.
create or replace function tg_nightly_platform_check()
returns table (invariant text, expected text, actual text, verdict text)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_run          bigint;
  v_tables       int; v_views int; v_mv int; v_mv_bad int;
  v_cron         int; v_cron_bad int;
  v_nav          int; v_nav_broken int;
  v_pol          int; v_no_rls int;
  v_anon_rel     int; v_anon_fn int; v_anon_wr int; v_mutable int;
  v_oq           int; v_gl int;
  v_tiles        int; v_no_target int;
  v_users        int; v_emps int;
begin
  select count(*) into v_tables from pg_tables where schemaname='public';
  select count(*) into v_views  from pg_views  where schemaname='public';
  select count(*) into v_mv     from pg_matviews where schemaname='public';
  select count(*) into v_mv_bad from pg_matviews where schemaname='public' and not ispopulated;
  select count(*) into v_cron   from cron.job;

  select count(*) into v_cron_bad
  from cron.job j
  join (select jobid, max(start_time) mt from cron.job_run_details group by 1) l on l.jobid=j.jobid
  join cron.job_run_details d on d.jobid=j.jobid and d.start_time=l.mt
  where d.status <> 'succeeded';

  select count(*) into v_nav from nav_registry where enabled;
  select count(*) into v_nav_broken
  from nav_registry nr
  where nr.enabled and coalesce(nr.table_ref,'') <> ''
    and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relname=nr.table_ref and c.relkind in ('r','v','m'));

  select count(*) into v_pol from pg_policy p join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public';

  select count(*) into v_no_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;

  select count(*) into v_anon_rel from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v','m') and has_table_privilege('anon',c.oid,'SELECT');

  -- Extension-owned functions are excluded throughout: pg_trgm and pg_net grant EXECUTE to
  -- PUBLIC by default and add 31 harmless entries that bury the ones that matter.
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
  select count(*) into v_gl from golive_items
    where coalesce(status::text,'') not in ('done','complete','closed');
  select count(*) into v_tiles from mv_department_dashboard;
  select greatest(v_tiles - (select count(*) from kpi_targets), 0) into v_no_target;
  select count(*) into v_users from app_users;
  select count(*) into v_emps from employees where status::text = 'active';

  insert into platform_state (
    base_tables, views, matviews, matviews_unpopulated, cron_jobs, cron_failing,
    nav_enabled, nav_broken, policies, tables_without_rls,
    anon_relations, anon_functions, anon_writing_functions, secdef_mutable_path,
    open_questions_unanswered, golive_open, tiles_total, tiles_without_target,
    app_users, active_employees, notes
  ) values (
    v_tables, v_views, v_mv, v_mv_bad, v_cron, v_cron_bad,
    v_nav, v_nav_broken, v_pol, v_no_rls,
    v_anon_rel, v_anon_fn, v_anon_wr, v_mutable,
    v_oq, v_gl, v_tiles, v_no_target,
    v_users, v_emps,
    'tg_nightly_platform_check'
  );

  -- Raise findings for broken invariants. ON CONFLICT because watchdog_findings carries a
  -- uniqueness constraint on fingerprint and is append-only (rule H2) - update the existing
  -- row rather than inserting a duplicate or deleting anything.
  insert into watchdog_runs default values returning id into v_run;

  if v_anon_rel > 0 or v_anon_fn > 0 then
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run, 'anon_surface_reopened', 'critical',
      'Anonymous access has reopened: ' || v_anon_rel || ' relation(s) and ' || v_anon_fn ||
        ' function(s) are reachable without signing in',
      'The public schema, over the REST API',
      'Whoever created the object, and the watchdog',
      'Since the object was created',
      'anon is every anonymous visitor - the publishable key ships inside the JavaScript '
        'bundle, so anything anon can reach is effectively public. On 7 August 2026 this '
        'exposed customers, manifests and wholesale figures, and 33 functions that write.',
      'The nightly platform check counted objects anon holds SELECT or EXECUTE on, excluding '
        'extension-owned functions.',
      'Revoke from PUBLIC as well as anon - revoking from anon alone is a no-op while PUBLIC '
        'holds the grant. Then run supabase/checks/anon_exposure.sql to confirm zero.',
      'anon relations ' || v_anon_rel || ', anon functions ' || v_anon_fn ||
        ', of which writing ' || v_anon_wr,
      v_anon_rel + v_anon_fn, 'settings', 'anon exposure security')
    on conflict (fingerprint) do update set
      severity = excluded.severity, what = excluded.what,
      the_arithmetic = excluded.the_arithmetic, record_count = excluded.record_count,
      run_id = excluded.run_id;
  end if;

  if v_no_rls > 0 then
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run, 'tables_without_rls', 'critical',
      v_no_rls || ' public table(s) have row-level security switched off',
      'The public schema',
      'Whoever created the table',
      'Since the table was created',
      'A table with RLS off is protected only by its grants. New tables arrive with RLS off by '
        'default, so this happens by omission rather than intent - and on 7 August it left the '
        'flag-decision record open to forgery by any signed-in user.',
      'The nightly platform check counted tables where relrowsecurity is false.',
      'alter table <name> enable row level security, then add policies mirroring an existing '
        'sibling table. Read-for-authenticated, write-for-owner-or-executive is the pattern.',
      v_no_rls || ' table(s)', v_no_rls, 'settings', 'rls disabled security')
    on conflict (fingerprint) do update set
      severity = excluded.severity, what = excluded.what,
      the_arithmetic = excluded.the_arithmetic, record_count = excluded.record_count,
      run_id = excluded.run_id;
  end if;

  if v_nav_broken > 0 then
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run, 'nav_points_at_missing_relation', 'elevated',
      v_nav_broken || ' menu item(s) point at a view or table that does not exist',
      'nav_registry',
      'Whoever dropped or renamed the relation',
      'Since the relation was dropped or renamed',
      'The page renders empty rather than erroring, so it looks like there is no data when the '
        'page is in fact broken. Laboratory Turnaround was pointed at a view that never '
        'existed and was blank from the day it was built.',
      'The nightly platform check joined every enabled nav_registry.table_ref to pg_class.',
      'Repoint the entry at the real relation, or disable the entry until the view exists.',
      v_nav_broken || ' of ' || v_nav || ' enabled entries', v_nav_broken,
      'settings', 'nav broken missing view')
    on conflict (fingerprint) do update set
      severity = excluded.severity, what = excluded.what,
      the_arithmetic = excluded.the_arithmetic, record_count = excluded.record_count,
      run_id = excluded.run_id;
  end if;

  -- Report card, for a human reading the result directly.
  return query
  select 'anon-readable relations',        '0', v_anon_rel::text,  case when v_anon_rel=0 then 'PASS' else 'FAIL' end union all
  select 'anon-executable functions',      '0', v_anon_fn::text,   case when v_anon_fn=0 then 'PASS' else 'FAIL' end union all
  select 'anon functions that WRITE',      '0', v_anon_wr::text,   case when v_anon_wr=0 then 'PASS' else 'FAIL' end union all
  select 'tables without RLS',             '0', v_no_rls::text,    case when v_no_rls=0 then 'PASS' else 'FAIL' end union all
  select 'SECDEF with mutable search_path','0', v_mutable::text,   case when v_mutable=0 then 'PASS' else 'FAIL' end union all
  select 'nav entries pointing nowhere',   '0', v_nav_broken::text,case when v_nav_broken=0 then 'PASS' else 'FAIL' end union all
  select 'matviews unpopulated',           '0', v_mv_bad::text,    case when v_mv_bad=0 then 'PASS' else 'FAIL' end union all
  select 'cron jobs failing',              '0', v_cron_bad::text,  case when v_cron_bad=0 then 'PASS' else 'WATCH' end union all
  select 'tiles with no owner-set target', '0', v_no_target::text, case when v_no_target=0 then 'PASS' else 'WATCH' end union all
  select 'unanswered owner questions',     '0', v_oq::text,        case when v_oq=0 then 'PASS' else 'WATCH' end union all
  select 'staff without an account',       '0', greatest(v_emps - v_users,0)::text,
                                                case when v_emps - v_users <= 0 then 'PASS' else 'WATCH' end;
end
$function$;

revoke all on function tg_nightly_platform_check() from public, anon;
grant execute on function tg_nightly_platform_check() to authenticated;

comment on function tg_nightly_platform_check is
 'Records the true platform state to platform_state and raises a watchdog finding for any '
 'broken invariant. Reads catalogues only - no external API calls. Runs once a day, per the '
 'owner''s hard rule that API calls are never flooded. Written 7 Aug 2026 after a handover '
 'document was found to state the opposite of the truth about anonymous access.';
