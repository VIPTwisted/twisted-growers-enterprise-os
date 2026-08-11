-- Agent: W (Watchdog), 11 Aug 2026.
--
-- PART 1 -- FORTIFY tg_require_fixture. It does not enforce what it was written for.
--
-- The charter, the trigger's own error text, and the 9 Aug defect register all say the
-- same thing: a check ships with BOTH halves of its fixture, positive and negative. The
-- trigger's final hint even names all three columns:
--
--     'set fixture_selftest_fn, fixture_positive_case and fixture_negative_case'
--
-- and then the code checks only two of them. fixture_positive_case may be blank and the
-- row is accepted. A checker could be registered as proven while nothing recorded the
-- violation it fires on.
--
-- Verified safe before tightening, which is the whole difference between fortifying a
-- guard and breaking everybody's work with it:
--
--     select count(*) from checker_registry
--      where enabled and fixture_proves_it_fails
--        and coalesce(btrim(fixture_positive_case),'') = '';   -->  0
--
-- Nobody is grandfathered by this and no existing row changes. It is a hole closed
-- before anything fell through it. Nothing else about the trigger moves: the
-- grandfathering path, the 25-character reason and the disabled-check exemption are
-- untouched, because loosening or tightening more than the fault requires is how a guard
-- stops being trusted.
--
-- PROVEN AGAINST THE LIVE TRIGGER, both halves, before this file was written:
--   POSITIVE  a row with fixture_proves_it_fails and no positive case was REFUSED with
--             P0001 "has no positive case".
--   NEGATIVE  the identical row WITH a positive case was ACCEPTED, then deleted, leaving
--             the registry exactly as it was.

create or replace function public.tg_require_fixture()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not new.enabled then
    return new;   -- a disabled check harms nobody
  end if;

  if coalesce(new.fixture_proves_it_fails,false) then
    -- Claiming a fixture means naming it. "Yes we tested it" is not a test.
    if coalesce(btrim(new.fixture_selftest_fn),'') = '' then
      raise exception
        'Checker % claims a fixture but names no function to prove it.', new.checker_key
        using hint = 'Set fixture_selftest_fn to the function that demonstrates this check '
                     'FIRING on a real violation and STAYING QUIET on a legitimate case.';
    end if;
    /* ADDED 11 Aug 2026. The hint below has demanded a positive case since this trigger
       was written and the code never checked for one. The negative half stops a wrong
       label; the POSITIVE half is the only thing that records what the check is for --
       without it, nobody can tell a check that fires from a check that has quietly
       stopped firing, which is the exact state the SQL guard was in on 8 Aug when it
       passed twenty fixtures while DROP TABLE watchdog_findings walked straight through. */
    if coalesce(btrim(new.fixture_positive_case),'') = '' then
      raise exception
        'Checker % has no positive case. Name the real violation it must fire on.',
        new.checker_key
        using hint = 'A check nobody has watched FAIL is a hypothesis. On 8 Aug 2026 the '
                     'SQL guard passed all twenty of its own fixtures while DROP TABLE '
                     'watchdog_findings walked straight through it.';
    end if;
    if coalesce(btrim(new.fixture_negative_case),'') = '' then
      raise exception
        'Checker % has no negative case. Name the legitimate thing it must NOT fire on.',
        new.checker_key
        using hint = 'Every defect recorded on 9 Aug 2026 was a false alarm - a check firing '
                     'on something legitimate. The negative case is the half that catches it.';
    end if;
    return new;
  end if;

  -- No fixture. Only allowed as recorded, reasoned debt.
  if new.grandfathered then
    if length(btrim(coalesce(new.grandfathered_reason,''))) < 25 then
      raise exception
        'Checker % is grandfathered without a reason.', new.checker_key
        using hint = 'Grandfathering is debt on the record, not a shrug. Say why it has no '
                     'fixture and what would be needed to write one.';
    end if;
    return new;
  end if;

  raise exception
    'Checker % cannot be enabled: nothing proves it can fail.', new.checker_key
    using hint = 'Write a fixture showing it FIRES on a real violation and STAYS QUIET on a '
                 'legitimate case, set fixture_selftest_fn, fixture_positive_case and '
                 'fixture_negative_case, then set fixture_proves_it_fails. A check nobody has '
                 'watched fail is a hypothesis, not a check. If it genuinely cannot be tested '
                 'yet, set grandfathered with 25 characters of reason - that is debt, and the '
                 'ratchet will not let the count rise.';
end;
$function$;

-- PART 2 -- register the three gates, each with both halves of its fixture.
--
-- 42 of the 52 enabled checkers are grandfathered with no fixture. These three are not
-- joining that number: each carries a --selftest that runs its detectors against named
-- cases and refuses to report anything if a detector is broken.

insert into public.checker_registry
  (checker_key, title, tier, runs_where, policy_keys, subject_kind,
   fixture_proves_it_fails, fixture_selftest_fn, fixture_positive_case, fixture_negative_case,
   enabled, note)
values
  ('gate.migration_drift',
   'Every migration running in production has a file in the repository',
   'gate', 'npm run check', array['rule_6'], 'migration',
   true,
   'node tools/checks/migration-drift.mjs --selftest  (10 cases, 5 negative)',
   'A migration applied after the newest baseline dump with no file: database_governance '
   'at 20260811115130 was live in production with no source in this repository. Also '
   'fires on a NAME recorded twice -- metrc_backfill_window_driver at 20260811154152 and '
   '20260811154220, 28 seconds apart, because apply_migration retried. Demonstrated live '
   'on 11 Aug: report_contract_ratchets was applied and the gate named it as missing '
   'before its file was written.',
   'Must stay quiet on 587 migrations applied BEFORE the baseline dump -- a squash IS the '
   'source for everything it covers, and demanding a file each would make the gate red on '
   'arrival, which is how a gate gets switched off. Also quiet on the baseline dump '
   'itself, which correctly has no row of its own; on two DIFFERENT migrations at adjacent '
   'timestamps, which is not a duplicate; and on '
   '20260811160000_cron_ops_dashboard_and_backfill.sql, a file deliberately recording cron '
   'changes made with execute_sql, which has no row in production and is not drift.',
   true,
   'Reads public.v_migration_history. DEGRADED without a database, on the pattern '
   'netlify.toml documents. Ratchet in tools/checks/migration-drift.baseline.json: '
   'missing 0, duplicates 3.'),

  ('gate.report_contract',
   'Reports meet L6, section 7, C3a, I4 and J7',
   'gate', 'npm run check', array['L6','C3a','I4','J7'], 'report',
   true,
   'node tools/checks/report-contract.mjs --selftest  (23 cases, 15 negative)',
   'Fires on: a filter or column list frozen into JSX (DIM_COLS at App.jsx:2589, FG_TABS '
   'at 7098-7106); a room shown without its department (15 sites, and room_qualified is '
   'rendered NOWHERE); a document fetch that can state none of the four canonical C3a '
   'reasons (App.jsx:1050, which renders a bare dash); a canonical reason present only '
   'inside a code comment (App.jsx:9243) counting as absent, which it is.',
   'Must stay quiet on: a two-value UI enum, which is not a filter list; a room in a '
   'COMPARISON rather than a render, which is App.jsx:3755 deciding a button state and is '
   'correct code; a React key, which nobody reads; room_type, room_id and room_cycle_flag, '
   'which are different columns; a canonical reason inside a real string, which counts as '
   'present; and a // inside a URL, which is not a comment. Also: 193 report pages that '
   'reach the Reports dropdown through report_group or belong to the Finance, Tax, HR and '
   'Deep menus -- counting all 286 rows outside surface=''reports'' would be a wrong label '
   'on 193 correct ones.',
   true,
   'Source rules run everywhere including Netlify. L6 and I4 need nav_registry and answer '
   'DEGRADED without it. Ratchets: repo counts in report-contract.baseline.json, database '
   'counts in ratchet_baseline (report_date_range_defect 102, report_nobody_can_open 113, '
   'report_outside_reports_menu 93).'),

  ('gate.silent_failure_read_sites',
   'Front-end reads bind their error, and the count may never rise',
   'gate', 'npm run check', array['A3'], 'read_site',
   true,
   'node tools/checks/silent-failures.mjs  (11 read-site cases, 7 negative, run on every invocation)',
   'Fires on a supabase response destructured without binding error -- ForensicAuditLedger '
   'at App.jsx:9101, where a permission denial, a dropped view and a statement timeout all '
   'become [] and the whole section vanishes from the Command Center with no message. '
   '117 of 142 such reads. Also fires when the generated schema dump records '
   '"NOT CAPTURED: permission denied for schema cron".',
   'Must stay quiet on: BrainFiles at App.jsx:5012, which binds error and whose ?? [] can '
   'therefore only mean the query succeeded and returned nothing; const { data } = props, '
   'which is not a database read; a fetch to something that is not supabase; a response '
   'binding only error; and a HAND-WRITTEN migration whose comment quotes a permission '
   'error it exists to FIX -- the prose trap that switched two guards off on 8 Aug.',
   true,
   'Extended 11 Aug 2026. The check had NEVER counted read sites: it scanned generated '
   'artefacts only, while the charter quoted 129 from a manual count nothing re-derived. '
   'True figures: 263 occurrences of ?? [], 117 unguarded supabase reads. Both ratcheted '
   'in silent-failures.baseline.json and corrected in the charter and the briefing.')
on conflict (checker_key) do nothing;
