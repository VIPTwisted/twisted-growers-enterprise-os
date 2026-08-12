-- ============================================================================
-- Register every guard that exists, then run the first real pass.
--
-- fixture_proves_it_fails is taken from the gates' OWN self-test output, not from
-- optimism. Eight gates print a passing self-test ("detector self-test PASSED (7
-- cases)") and are marked proven. Thirteen print no self-test and are marked
-- UNPROVEN -- which is not an accusation, it is the honest state. The schema
-- baseline gate looked healthy for a day and was a clock.
-- ============================================================================

insert into checker_registry
  (checker_key, title, tier, runs_where, expected_interval, fixture_proves_it_fails, policy_keys, note)
values
  -- ── TIER 1: PREVENT — the error never enters ──
  ('hook.guard_sql',        'SQL guard hook — E1/E6/H2 at authoring time', 'prevent', 'Claude Code PreToolUse hook', null, true,  '{E1,E6,H2}', '27 fixtures; hook and ci.yml agree on all 23 SQL cases.'),
  ('hook.guard_files',      'Protected files / theme lock hook',           'prevent', 'Claude Code PreToolUse hook', null, true,  '{I1}',       'Fixtures cover styles.css and rules.css.'),
  ('trigger.ddl_guard',     'DDL event trigger — auto-revokes anon, pins search_path', 'prevent', 'Postgres event trigger', null, true, '{E6}', 'Auto-fixes rather than warns; five warnings were ignored before that change.'),
  ('trigger.h2_no_delete',  'Forensic delete blocker',                     'prevent', 'Postgres row trigger', null, true, '{H2}', 'Applies to every caller including the table owner.'),

  -- ── TIER 2: GATE — the error never ships. 21 gates, blocking in the Netlify build. ──
  ('gate.source_intact',    'source-intact — no file gutted',              'gate', 'npm run check', null, false, '{A3}',  null),
  ('gate.schema_baseline',  'schema-baseline-fresh — baseline matches live','gate', 'npm run check', null, true,  '{E3}',  'PROVEN 8 Aug 2026: doctored counts produced exit 1 reporting +16 tables.'),
  ('gate.theme_lock',       'theme-lock',                                  'gate', 'npm run check', null, false, '{I1}',  null),
  ('gate.parse_check',      'parse-check',                                 'gate', 'npm run check', null, false, '{F1}',  null),
  ('gate.no_hardcoded',     'no-hardcoded-numbers',                        'gate', 'npm run check', null, false, '{A1,A2,C2,G1}', '26 known frozen figures still in the baseline.'),
  ('gate.boundaries',       'error-boundaries',                            'gate', 'npm run check', null, false, '{F2}',  null),
  ('gate.routing',          'routing',                                     'gate', 'npm run check', null, false, '{F2}',  null),
  ('gate.trend_sentiment',  'trend-sentiment — movement judged by target', 'gate', 'npm run check', null, false, '{A2}',  null),
  ('gate.bridge_direct',    'bridge-direct — no credential to the browser','gate', 'npm run check', null, false, '{E6}',  null),
  ('gate.rules_in_sync',    'rules-in-sync — 3 runtimes carry the rules',  'gate', 'npm run check', null, false, '{A1}',  null),
  ('gate.guard_fixtures',   'guard-fixtures — the guards are proven',      'gate', 'npm run check', null, true,  '{E1,E6,H2,I1}', '27 fixtures.'),
  ('gate.secret_scan',      'secret-scan',                                 'gate', 'npm run check', null, false, '{A3}',  '4 KNOWN exposures carried in the baseline, rotation declined by owner.'),
  ('gate.rule_ledger',      'rule-ledger — no rule loses its enforcement', 'gate', 'npm run check', null, false, '{A1}',  'Loader for policy_registry. Reports 27/50 enforced.'),
  ('gate.aggregate_count',  'aggregate-count',                             'gate', 'npm run check', null, true,  '{C2,E4,G1}', 'Classifier self-test, 5 cases.'),
  ('gate.literal_licences', 'literal-licences',                            'gate', 'npm run check', null, true,  '{C0,G1,G2}', 'Pattern self-test, 6 cases. 57 literals at baseline.'),
  ('gate.no_fabricated',    'no-fabricated-data',                          'gate', 'npm run check', null, true,  '{A1,A3}', 'Detector self-test, 7 cases.'),
  ('gate.tile_drills',      'tile-drills',                                 'gate', 'npm run check', null, true,  '{C1}',  'Detector self-test, 5 cases.'),
  ('gate.ui_language',      'ui-language',                                 'gate', 'npm run check', null, true,  '{F4,I3}', 'Detector self-test, 4 cases.'),
  ('gate.dead_controls',    'dead-controls',                               'gate', 'npm run check', null, true,  '{A3,I2}', 'Detector self-test, 7 cases. 332 buttons, 0 inert.'),
  ('gate.all_checks_wired', 'all-checks-wired — every guard runs in BOTH', 'gate', 'npm run check', null, false, '{A3}',  'Guards the wiring of the other 20.'),
  ('gate.eslint_ratchet',   'eslint-ratchet',                              'gate', 'npm run check', null, false, '{F1}',  '0 errors, 19 warnings at baseline.'),

  -- ── TIER 3: DETECT — found within minutes or hours ──
  ('detect.page_canary',       'Page canary — 518 pages probed',            'detect', 'cron page-canary',            interval '20 minutes', false, '{C1,A3}', null),
  ('detect.platform_check',    'Nightly platform check',                    'detect', 'cron nightly-platform-check', interval '1 day',      false, '{E3,E5}', null),
  ('detect.integrity_check',   'Nightly integrity check',                   'detect', 'cron nightly-integrity-check',interval '1 day',      false, '{H2}',    null),
  ('detect.role_clearance',    'Nightly role clearance',                    'detect', 'cron nightly-role-clearance', interval '1 day',      false, '{A5}',    null),
  ('detect.custody_monitor',   'Custody red-flag monitor',                  'detect', 'cron custody-monitor',        interval '20 minutes', false, '{C6d,D2}',null),
  ('detect.sync_review',       'Sync review agent',                         'detect', 'cron sync-review',            interval '1 hour',     false, '{D1}',    null),
  ('detect.watchdog_am',       'Watchdog, morning',                         'detect', 'cron watchdog-am',            interval '1 day',      false, '{H1}',    null),
  ('detect.watchdog_pm',       'Watchdog, afternoon',                       'detect', 'cron watchdog-pm',            interval '1 day',      false, '{H1}',    null),
  ('detect.brain_claims',      'Brain claims check',                        'detect', 'cron brain-claims-check',     interval '1 day',      false, '{A1}',    null),
  ('detect.sweep_unknowns',    'Unknowns sweep',                            'detect', 'cron sweep-unknowns',         interval '4 hours',    false, '{A3}',    null),
  ('detect.mirror_freshness',  'Metrc mirror freshness per table',          'detect', 'tg_forensic_audit()',         interval '1 day',      false, '{D1,D2}', 'LAW 2. On 8 Aug MC281714 items were 2 days stale while every status said succeeded.'),
  ('detect.doc_completeness',  'COA and manifest completeness per package', 'detect', 'tg_forensic_audit()',         interval '1 day',      false, '{C3,C3a}','The 386 shipped-without-certificate finding.'),
  ('detect.security_posture',  'RLS bypass, matview exposure, policy gaps', 'detect', 'tg_forensic_audit()',         interval '1 day',      false, '{E6}',    'The 252 SECURITY DEFINER views nothing was looking at.'),

  -- ── TIER 4: PROVE — derive independently, disagreement is the finding ──
  ('prove.verification_suite', 'Verification suite — 17 two-source checks', 'prove', 'cron verification-suite', interval '12 hours', false, '{A4,C2}', 'NEVER FIRED. 121 runs exist from manual invocation only.'),
  ('prove.forensic_audit',     'Weekly forensic audit',                     'prove', 'cron forensic-audit',    interval '7 days',   false, '{H1}',    'NEVER FIRED.'),
  ('prove.reconcile_tiles',    'Tile totals reconcile to their drills',     'prove', 'tg_reconcile_tiles()',   interval '1 day',    false, '{C1,C2}', 'Results were never persisted before the ledger existed.')
on conflict (checker_key) do update
  set title = excluded.title, tier = excluded.tier, runs_where = excluded.runs_where,
      expected_interval = excluded.expected_interval,
      fixture_proves_it_fails = excluded.fixture_proves_it_fails,
      policy_keys = excluded.policy_keys, note = excluded.note;


-- ─────────────────────────────────────────────────────────────────────────────
-- tg_forensic_audit() — the 24/7 pass. Every row carries a denominator (LAW 1)
-- and the age of the data it examined (LAW 2).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function tg_forensic_audit()
returns table(checker text, subject text, verdict text, detail text)
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_run uuid := gen_random_uuid();
begin
  -- ── DOCUMENTS: certificate on shipped material (rules C3, C3a) ──
  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, pounds, the_arithmetic, drill, data_as_of)
  select v_run, 'detect.doc_completeness', 'C3a', 'metric', 'coa_on_shipped_packages',
         case when count(*) filter (where was_shipped and coa_count = 0) = 0
              then 'PASS' else 'FAIL' end,
         count(*) filter (where was_shipped and coa_count > 0),
         count(*) filter (where was_shipped),
         round(sum(pounds) filter (where was_shipped and coa_count = 0)::numeric, 1),
         count(*) filter (where was_shipped and coa_count > 0) || ' of ' ||
         count(*) filter (where was_shipped) || ' shipped packages have a certificate on file. ' ||
         count(*) filter (where was_shipped and coa_count = 0) ||
         ' do not. This means we cannot PRODUCE a certificate for them; it does not prove none ' ||
         'was issued (rule A3).',
         'v_item_documents', now()
  from v_item_documents;

  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, pounds, the_arithmetic, drill, data_as_of)
  select v_run, 'detect.doc_completeness', 'C3a', 'metric', 'manifest_on_shipped_packages',
         case when count(*) filter (where was_shipped and manifest_count = 0) = 0
              then 'PASS' else 'FAIL' end,
         count(*) filter (where was_shipped and manifest_count > 0),
         count(*) filter (where was_shipped),
         round(coalesce(sum(pounds) filter (where was_shipped and manifest_count = 0),0)::numeric,1),
         count(*) filter (where was_shipped and manifest_count > 0) || ' of ' ||
         count(*) filter (where was_shipped) || ' shipped packages have a manifest.',
         'v_item_documents', now()
  from v_item_documents;

  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, pounds, the_arithmetic, drill, data_as_of)
  select v_run, 'detect.doc_completeness', 'C3', 'metric', 'tested_before_shipped',
         case when count(*) filter (where was_shipped and not was_tested) = 0
              then 'PASS' else 'FAIL' end,
         count(*) filter (where was_shipped and was_tested),
         count(*) filter (where was_shipped),
         round(coalesce(sum(pounds) filter (where was_shipped and not was_tested),0)::numeric,1),
         count(*) filter (where was_shipped and not was_tested) ||
         ' package(s) were shipped having never been tested.',
         'v_item_documents', now()
  from v_item_documents;

  -- ── SECURITY: the class nothing was watching (rule E6) ──
  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, the_arithmetic, data_as_of)
  select v_run, 'detect.security_posture', 'E6', 'metric', 'views_enforcing_rls',
         case when bad = 0 then 'PASS' else 'FAIL' end, total - bad, total,
         (total - bad) || ' of ' || total || ' views enforce row-level security. ' || bad ||
         ' run as the view owner and bypass every policy on their base tables.', now()
  from (select count(*) as total,
               count(*) filter (where coalesce((select option_value from pg_options_to_table(c.reloptions)
                                                where option_name='security_invoker'),'false') <> 'true') as bad
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='v') s;

  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, the_arithmetic, data_as_of)
  select v_run, 'detect.security_posture', 'E6', 'metric', 'matviews_not_readable_by_staff',
         case when exposed = 0 then 'PASS' else 'FAIL' end, total - exposed, total,
         exposed || ' of ' || total || ' materialized views are readable by every signed-in ' ||
         'user. Postgres cannot apply row-level security to a materialized view at all.', now()
  from (select count(*) as total,
               count(*) filter (where has_table_privilege('authenticated', c.oid, 'SELECT')) as exposed
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='m') s;

  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, the_arithmetic, data_as_of)
  select v_run, 'detect.security_posture', 'E6', 'metric', 'tables_rls_with_policy',
         case when naked = 0 then 'PASS' else 'FAIL' end, total - naked, total,
         naked || ' table(s) have row-level security enabled with NO policy at all, so nothing ' ||
         'can read them through the interface -- fail-closed, and invisible on screen.', now()
  from (select count(*) filter (where c.relrowsecurity) as total,
               count(*) filter (where c.relrowsecurity
                                 and not exists (select 1 from pg_policy p where p.polrelid=c.oid)) as naked
          from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='r') s;

  -- ── LAW 2: mirror freshness. A check over stale data is not a passing check. ──
  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, data_as_of, the_arithmetic, drill)
  select v_run, 'detect.mirror_freshness', 'D1', 'table', t.tbl,
         case when t.last_sync > now() - interval '36 hours' then 'PASS' else 'FAIL' end,
         t.n, t.n, t.last_sync,
         t.tbl || ' last synced ' || t.last_sync || ' (' ||
         round(extract(epoch from (now() - t.last_sync))/3600.0, 1) || ' hours ago), ' ||
         t.n || ' rows. Every sync status reads "succeeded" regardless.',
         t.tbl
  from (select 'metrc_items'     as tbl, max(synced_at) as last_sync, count(*) as n from metrc_items
        union all select 'metrc_strains',   max(synced_at), count(*) from metrc_strains
        union all select 'metrc_locations', max(synced_at), count(*) from metrc_locations
        union all select 'metrc_packages',  max(synced_at), count(*) from metrc_packages) t
  where t.last_sync is not null;

  -- ── PROVE: persist the tile reconciliation, which never had a memory ──
  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, the_arithmetic, data_as_of)
  select v_run, 'prove.reconcile_tiles', 'C2', 'metric', 'tiles_reconciled',
         case when r.bad = 0 then 'PASS' else 'FAIL' end, r.good, r.total,
         r.good || ' of ' || r.total || ' tiles reconcile to their drill. ' || r.bad ||
         ' disagree or cannot be verified without a declared drill column and aggregate.', now()
  from (select count(*) as total,
               count(*) filter (where verdict = 'RECONCILED') as good,
               count(*) filter (where verdict in ('FAIL','DISAGREES','REVIEW')) as bad
          from tg_reconcile_tiles()) r;

  -- ── PROVE: the two-source suite. Its own silence is the finding. ──
  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, the_arithmetic, data_as_of)
  select v_run, 'prove.verification_suite', 'A4', 'metric', 'two_source_checks_agreeing',
         case when total = 0 then 'UNCHECKED'
              when disagreeing = 0 then 'PASS' else 'FAIL' end,
         total - disagreeing,
         nullif(total, 0),
         case when total = 0
              then 'No verification run has ever been recorded for the current check set.'
              else (total - disagreeing) || ' of ' || total ||
                   ' two-source checks agree within tolerance.' end,
         (select max(ran_at) from verification_runs)
  from (select count(distinct check_key) as total,
               count(distinct check_key) filter (where verdict is distinct from 'AGREE') as disagreeing
          from verification_runs
         where ran_at > now() - interval '30 days') v;

  -- ── LAW 3: coverage is itself a verdict, recorded so it can be trended. ──
  insert into conformance_ledger (run_id, checker_key, policy_key, subject_kind, subject_ref,
         verdict, numerator, denominator, the_arithmetic, data_as_of)
  select v_run, 'detect.security_posture', 'A3', 'metric', 'platform_coverage',
         case when never = 0 then 'PASS' else 'FAIL' end, total - never, total,
         (total - never) || ' of ' || total || ' subjects have ever been checked by anything. ' ||
         never || ' have never been examined -- green over an unexamined subject means "not looked at".',
         now()
  from (select count(*) as total, count(*) filter (where coverage = 'NEVER CHECKED') as never
          from v_conformance_coverage) c;

  return query
    select cl.checker_key, cl.subject_ref, cl.verdict,
           coalesce(cl.the_arithmetic, cl.note)
      from conformance_ledger cl
     where cl.run_id = v_run
     order by case cl.verdict when 'FAIL' then 1 when 'DISAGREE' then 2
                              when 'UNCHECKED' then 3 else 4 end, cl.subject_ref;
end $function$;

revoke all on function tg_forensic_audit() from public, anon;
grant execute on function tg_forensic_audit() to authenticated;;
