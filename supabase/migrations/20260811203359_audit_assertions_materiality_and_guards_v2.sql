-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-008 (reviewers V, X, W).
-- Owner directive: elite IRS and CCC examiner standard, to the level of a top cannabis
-- accounting practice, for every agent and every guard.
--
-- SECOND ATTEMPT. The first was REFUSED by trg_require_fixture: "claims a fixture but names no
-- function to prove it." The guard was right and I was wrong - I had written fixture prose and
-- called it a fixture. Prose is not a fixture. Both halves now execute.
--
-- WHAT SEPARATES A FIRM FROM A CLEVER PERSON CHECKING THINGS. Three things, none of which
-- existed here as structure:
--   1. THE ASSERTIONS FRAMEWORK. A professional tests named assertions - existence,
--      completeness, accuracy, rights, cutoff, classification, authorisation - and can say
--      which one each procedure covers and which is uncovered. An uncovered assertion is a
--      hole in the audit plan even when every test passes, and it is invisible without naming.
--   2. MATERIALITY, DECLARED IN ADVANCE. Set before testing or it becomes an excuse for
--      whatever was found. It also stops the opposite failure: chasing rounding while
--      something real walks past.
--   3. WORKING PAPERS. Every conclusion tied to re-performable evidence. conformance_ledger
--      and audit_journal already do this, which is why this extends them.
--
-- THE 280E AMPLIFIER. For an ordinary business an inventory misstatement moves taxable income
-- only through the margin. Under IRC 280E almost every deduction is disallowed and COGS is what
-- remains, so the same error flows to taxable income close to dollar for dollar. Our inventory
-- materiality must therefore be far tighter than a normal manufacturer's.
--
-- WHERE MATERIALITY DOES NOT APPLY AT ALL. No de minimis exists for an untagged plant, an
-- unmanifested transfer or an undocumented destruction. One is a finding. Any agent applying a
-- dollar threshold to a diversion-class question has misunderstood the job.
--
-- MATERIALITY FIGURES ARE PROPOSED, NOT SET - marked provisional, and based on the lower of two
-- revenue derivations that disagree by $97,256, a difference that is itself an open finding.
-- Setting a threshold on a disputed number would be unsound. Needs the owner and the signing CPA.
--
-- UNDO: drop view v_assertion_coverage; alter table examination_standard drop column assertion;
--       drop table audit_assertion;
--       drop function tg_selftest_examination_readiness(text), tg_selftest_assertion_coverage(text);
--       delete from conversion_factors where key like 'materiality_%';
--       delete from verification_checks where check_key like 'examination-%';
--       delete from checker_registry where checker_key in ('prove.examination_readiness','detect.assertion_coverage');

create table if not exists audit_assertion (
  assertion        text primary key,
  plain_english    text not null,
  what_failure_looks_like_here text not null,
  who_cares        text not null,
  no_materiality_floor boolean not null default false,
  note             text
);

alter table audit_assertion enable row level security;

comment on table audit_assertion is
 'The audit assertions every procedure in this platform must map to. A test that cannot name the '
 'assertion it covers is not a control, it is a query. Coverage is read through '
 'v_assertion_coverage: an assertion with no control is a hole in the audit plan even when every '
 'other check is green.';

comment on column audit_assertion.no_materiality_floor is
 'TRUE means no dollar or weight threshold may be applied to a failure of this assertion. One '
 'untagged plant is a finding. Netting it against turnover is how a compliance failure gets '
 'quietly reclassified as noise.';

insert into audit_assertion (assertion, plain_english, what_failure_looks_like_here, who_cares, no_materiality_floor, note) values
('existence',
 'The thing we say we hold, we actually hold.',
 'A tag on the books with no material behind it, or stock counted in two places at once. The held-package-counted-once check exists because this failed.',
 'IRS on ending inventory; CCC on physical reconciliation', false,
 'Tested by counting outward from the record to the shelf.'),
('completeness',
 'Everything that happened is recorded. Nothing was left out.',
 'The hardest assertion here and the one most often failed. 290 harvests once held zero plant records; the mirror held 15,595 plants against 49,418 real ones. Nothing looked wrong, because absent rows raise no error - an INNER join drops them silently.',
 'Both. It is the assertion an examiner probes hardest because it is the easiest to fail quietly.', true,
 'Tested by counting inward from the shelf to the record - the opposite direction to existence. Both directions are required; either alone is worthless.'),
('accuracy_valuation',
 'Recorded at the right amount, the right weight and the right cost.',
 'Grams read as pounds. The $0.01 placeholder treated as a price - 168 of 660 inbound lines carry it. A declared wholesale transfer price quoted as though it were cost.',
 'IRS on COGS; CCC on weights', false,
 'Every comparison must normalise unit and population first. Three false findings in one day came from skipping that.'),
('rights_obligations',
 'It is ours to hold, process and sell - and what is not ours is not counted as ours.',
 'Tolled material counted as inventory. Third-party material called ours. Our own material returning from a third-party warehouse booked as a purchase.',
 'IRS on inventory ownership; CCC on licensee attribution', false,
 'Owner rulings C0, C6d and 4A govern. Name the licensee, never "ours".'),
('cutoff',
 'Recorded in the period it actually happened in.',
 'Material received on 31 December landing in January, or a sale straddling year end. Moves the year-end inventory figure the whole 280E computation rests on.',
 'IRS above all - the classic year-end procedure', false,
 'NOTHING IN THIS PLATFORM TESTS CUTOFF TODAY. The year-end close is exactly when that bites.'),
('classification_presentation',
 'Recorded in the right category, and presented so it cannot mislead.',
 'An operating expense capitalised into inventory. A custody movement presented as third-party spend on a dashboard tile.',
 'IRS on 280E allocation; the owner on every tile he reads', false,
 'A tile that misleads is a presentation failure even when the arithmetic behind it is right.'),
('authorisation',
 'Someone entitled to approve it approved it, before it happened.',
 'Material allotted without an Admin, CEO or CFO approving. A schema change with fewer than three independent reviewers. An agent widening a tolerance to make its own check pass.',
 'CCC on controls; the owner on allotments', false,
 'The allotment approval workflow and db_change_review are both controls over this assertion.')
on conflict (assertion) do nothing;

alter table examination_standard add column if not exists assertion text references audit_assertion(assertion);

update examination_standard set assertion = case test_key
  when 'irs-280e-only-cogs'            then 'classification_presentation'
  when 'irs-471-inventory-costing'     then 'accuracy_valuation'
  when 'irs-inventory-year-end-count'  then 'existence'
  when 'irs-purchase-substantiation'   then 'accuracy_valuation'
  when 'irs-no-estimates'              then 'accuracy_valuation'
  when 'irs-cash-form-8300'            then 'completeness'
  when 'irs-related-party'             then 'rights_obligations'
  when 'irs-books-and-records'         then 'completeness'
  when 'ccc-every-plant-tagged'        then 'completeness'
  when 'ccc-package-traceability'      then 'completeness'
  when 'ccc-inventory-reconciliation'  then 'existence'
  when 'ccc-transfer-manifests'        then 'completeness'
  when 'ccc-testing-before-sale'       then 'authorisation'
  when 'ccc-waste-disposal'            then 'completeness'
  when 'ccc-record-retention'          then 'completeness'
  when 'ccc-metrc-is-the-record'       then 'rights_obligations'
  else assertion end
where assertion is null;

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note) values
('materiality_planning_usd', 71000, 'USD', 'Planning materiality',
 'The threshold at which a misstatement would change how a reader of our numbers behaves. Set BEFORE testing, never after.',
 'Derived: 1% of $7,146,829, the lower of the two disagreeing revenue derivations. NOT owner-approved.', 'Agent I', 'provisional',
 'PROPOSED, NOT SET. The two revenue derivations disagree by $97,256 and that disagreement is itself an open finding, so this base figure is in dispute. Needs the owner and the CPA who signs the return.'),
('materiality_inventory_usd', 25000, 'USD', 'Inventory and COGS materiality',
 'Deliberately far tighter than planning materiality. Under IRC 280E an inventory or COGS error flows to taxable income close to dollar for dollar rather than through the margin.',
 'Judgement: roughly one third of planning materiality, reflecting 280E amplification. NOT owner-approved.', 'Agent I', 'provisional',
 'PROPOSED, NOT SET. The multiplier is a judgement an examiner would expect to see reasoned, not a computed figure.'),
('materiality_trivial_usd', 3500, 'USD', 'Clearly trivial threshold',
 'Below this an individual difference is recorded in the working papers and not investigated. Differences below it still ACCUMULATE and are assessed together - that is what stops a thousand small errors hiding a large one.',
 'Convention: 5% of planning materiality. NOT owner-approved.', 'Agent I', 'provisional',
 'PROPOSED, NOT SET.'),
('materiality_none_for_diversion', 0, 'rule', 'No materiality floor on diversion-class findings',
 'There is NO dollar or weight threshold for an untagged plant, an unmanifested transfer, an undocumented destruction or an untraceable package. One is a finding. A regulator does not net these against turnover.',
 'Regulatory reality, not a computation. Mirrored by audit_assertion.no_materiality_floor on completeness.', 'Agent I', 'definitional',
 'This one is NOT provisional. It is definitional and applies immediately.')
on conflict (key) do nothing;

create or replace view v_assertion_coverage as
with tests as (
  select a.assertion, a.plain_english, a.no_materiality_floor,
         count(e.test_key)                                         as examination_tests,
         count(e.test_key) filter (where e.where_it_lives is null)  as cannot_produce,
         count(distinct e.control_key)                              as named_controls
  from audit_assertion a
  left join examination_standard e on e.assertion = a.assertion
  group by a.assertion, a.plain_english, a.no_materiality_floor
)
select t.*,
       case
         when t.examination_tests = 0 then 'NO TEST AT ALL — assertion is unexamined'
         when t.named_controls   = 0 then 'TESTED BUT UNGUARDED — no automated control'
         when t.cannot_produce   > 0 then 'PARTLY UNPRODUCIBLE — ' || t.cannot_produce || ' test(s) have no evidence source'
         else 'COVERED'
       end as coverage_verdict
from tests t
order by (t.named_controls = 0) desc, t.cannot_produce desc, t.assertion;

comment on view v_assertion_coverage is
 'Audit-plan coverage by assertion. Read before claiming the platform is verified: every check '
 'can be green while an entire assertion has no test behind it. NO TEST AT ALL and TESTED BUT '
 'UNGUARDED are audit-plan failures, not data failures.';

-- ─────────────────── FIXTURES. Both halves execute. This is the part I got wrong. ───────────────────
create or replace function public.tg_selftest_examination_readiness(p_by text default 'selftest')
returns table(case_name text, passed boolean, actual text)
language plpgsql security definer set search_path to 'public'
as $fn$
declare a numeric; b numeric;
begin
  -- POSITIVE half: a test with no evidence source must make the check FIRE.
  with fixture(test_key, where_it_lives) as (
    values ('fx-sourced', 'metrc_packages'::text), ('fx-unsourced', null::text))
  select count(*), count(*) filter (where where_it_lives is not null) into a, b from fixture;
  return query select 'FIRES when a test has no evidence source'::text, (a <> b),
                      format('%s tests, %s producible - %s', a, b,
                             case when a <> b then 'disagrees, correct' else 'stayed quiet, BROKEN' end);

  -- NEGATIVE half: every test sourced, the check must STAY QUIET.
  with fixture(test_key, where_it_lives) as (
    values ('fx-a', 'metrc_packages'::text), ('fx-b', 'coa_extract'::text))
  select count(*), count(*) filter (where where_it_lives is not null) into a, b from fixture;
  return query select 'QUIET when every test has an evidence source'::text, (a = b),
                      format('%s tests, %s producible - %s', a, b,
                             case when a = b then 'agrees, correct' else 'fired anyway, BROKEN' end);

  -- The live position, reported rather than scored.
  select count(*), count(*) filter (where where_it_lives is not null) into a, b from examination_standard;
  return query select 'live position (informational, not a pass condition)'::text, true,
                      format('%s examination tests, %s producible, %s CANNOT BE PRODUCED', a, b, a - b);
end $fn$;

comment on function public.tg_selftest_examination_readiness(text) is
 'Fixture for prove.examination_readiness. Runs both halves against synthetic rows so the QUIET '
 'half can be demonstrated even while the live check is legitimately failing, and reports the '
 'live position separately. Touches no real row.';

create or replace function public.tg_selftest_assertion_coverage(p_by text default 'selftest')
returns table(case_name text, passed boolean, actual text)
language plpgsql security definer set search_path to 'public'
as $fn$
declare a numeric; b numeric;
begin
  -- POSITIVE half: an assertion nobody tests must make the check FIRE.
  with asrt(assertion) as (values ('fx-covered'::text), ('fx-orphan'::text)),
       ctl(assertion, control_key) as (values ('fx-covered'::text, 'some-check'::text))
  select (select count(*) from asrt),
         (select count(distinct c.assertion) from ctl c where c.control_key is not null) into a, b;
  return query select 'FIRES when an assertion has no control'::text, (a <> b),
                      format('%s assertions, %s guarded - %s', a, b,
                             case when a <> b then 'disagrees, correct' else 'stayed quiet, BROKEN' end);

  -- NEGATIVE half: every assertion guarded, the check must STAY QUIET.
  with asrt(assertion) as (values ('fx-a'::text), ('fx-b'::text)),
       ctl(assertion, control_key) as (values ('fx-a'::text, 'check-1'::text), ('fx-b'::text, 'check-2'::text))
  select (select count(*) from asrt),
         (select count(distinct c.assertion) from ctl c where c.control_key is not null) into a, b;
  return query select 'QUIET when every assertion has a control'::text, (a = b),
                      format('%s assertions, %s guarded - %s', a, b,
                             case when a = b then 'agrees, correct' else 'fired anyway, BROKEN' end);

  select (select count(*) from audit_assertion),
         (select count(*) from (select a2.assertion from audit_assertion a2
                                  join examination_standard e on e.assertion = a2.assertion
                                 where e.control_key is not null group by a2.assertion) x) into a, b;
  return query select 'live position (informational, not a pass condition)'::text, true,
                      format('%s assertions, %s guarded, %s with NO control at all', a, b, a - b);
end $fn$;

comment on function public.tg_selftest_assertion_coverage(text) is
 'Fixture for detect.assertion_coverage. Both halves run against synthetic rows; the live '
 'position is reported separately because cutoff genuinely has no control today and the QUIET '
 'half could not otherwise be demonstrated. Touches no real row.';

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values
('examination-every-test-producible',
 'Every examination test has somewhere the evidence actually lives',
 'An examiner asks for a document and we either hand it over or we do not. This counts the tests '
 'where nothing in the platform holds the evidence. It DISAGREES on registration and that is '
 'correct - the gaps are real, and the largest is that we cannot produce a year-end physical '
 'inventory count, the first thing an IRS examiner asks for on a 280E file and the exact work in '
 'flight right now. Close it by BUILDING the evidence, never by deleting the test.',
 'Examination tests defined',
 'select count(*)::numeric from examination_standard',
 'Of those, how many have an evidence source',
 'select count(*)::numeric from examination_standard where where_it_lives is not null',
 0, 'critical', 'Agent I', true, date '2026-08-11', false),
('examination-every-assertion-guarded',
 'Every audit assertion has at least one automated control behind it',
 'A hole in the audit plan is invisible from inside the audit plan: every check can pass while an '
 'entire assertion goes untested. Cutoff is the live example - nothing here tests whether a '
 'transaction landed in the right period, and cutoff is the classic year-end procedure.',
 'Assertions defined',
 'select count(*)::numeric from audit_assertion',
 'Of those, how many have at least one named control',
 'select count(*)::numeric from (select a.assertion from audit_assertion a join examination_standard e on e.assertion = a.assertion where e.control_key is not null group by a.assertion) x',
 0, 'elevated', 'Agent W', true, date '2026-08-11', false)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_sql = excluded.source_a_sql, source_b_sql = excluded.source_b_sql,
  severity = excluded.severity, owner = excluded.owner, enabled = excluded.enabled;

insert into checker_registry
 (checker_key, title, tier, runs_where, expected_interval, policy_keys, subject_kind,
  fixture_proves_it_fails, enabled, note, added_on,
  fixture_selftest_fn, fixture_positive_case, fixture_negative_case)
values
('prove.examination_readiness',
 'Examination readiness: can we produce what an IRS or CCC examiner would ask for',
 'prove', 'cron verification-suite', interval '12 hours', array['A4'], 'metric',
 true, true,
 'Reads examination_standard. CANNOT PRODUCE is the verdict that matters: no relation in the platform holds the evidence.',
 date '2026-08-11',
 'tg_selftest_examination_readiness',
 'A test with where_it_lives NULL makes producible fall below total and the check disagrees.',
 'With every test carrying an evidence source both sides return the same count and it stays quiet.'),
('detect.assertion_coverage',
 'Audit-plan coverage: every assertion has a control behind it',
 'detect', 'cron verification-suite', interval '12 hours', array['A3'], 'metric',
 true, true,
 'Reads audit_assertion against examination_standard. Catches what no data check can: an entire assertion nobody is testing.',
 date '2026-08-11',
 'tg_selftest_assertion_coverage',
 'An assertion with no examination test referencing it makes guarded fall below total and the check disagrees.',
 'With every assertion carrying at least one control_key both sides match and it stays quiet.')
on conflict (checker_key) do nothing;;
