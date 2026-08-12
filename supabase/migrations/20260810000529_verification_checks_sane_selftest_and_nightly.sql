-- THE META-CHECK PROVES ITSELF BEFORE IT JUDGES ANYTHING.
--
-- A meta-check that silently stops catching is the worst object in the system: it certifies
-- every other check as sound while detecting nothing. So it carries five deliberately broken
-- fixtures, inserts them inside a transaction, asserts each is caught by the RIGHT rule, and
-- rolls them back. If any fixture escapes, the audit REFUSES TO REPORT rather than returning a
-- clean sheet - because a clean sheet from a blind auditor is worse than no auditor.
--
-- Rule C0b: a check that cannot fail proves nothing. That applies to this one too.

create or replace function public.tg_verification_checks_sane_selftest()
 returns table(fixture text, expected_problem text, caught boolean)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  fx constant text[][] := array[
    ['_fx_cannot_fail',  'CANNOT FAIL'],
    ['_fx_population',   'POPULATION MISMATCH'],
    ['_fx_tolerance',    'TOLERANCE ON AN IDENTITY'],
    ['_fx_broken_sql',   'SOURCE A FAILS TO RUN'],
    ['_fx_incomplete',   'INCOMPLETE']
  ];
  i int;
begin
  /* Inserted and removed inside this function. verification_checks is configuration, not a
     forensic table, so this leaves no permanent trace and violates no immutability rule (H2). */
  insert into verification_checks
   (check_key,title,what_it_proves,source_a_label,source_a_sql,source_b_label,source_b_sql,
    tolerance_pct,severity,owner,enabled,added_on)
  values
   ('_fx_cannot_fail','Fixture: identical sources','Both sides run the same SQL.',
     'A','select 1::numeric','B','select  1::NUMERIC',0,'elevated','fixture',true,current_date),
   ('_fx_population','Fixture: sum against count','One side sums, the other counts.',
     'A','select sum(1)::numeric','B','select count(*)::numeric from metrc_packages',0,'elevated','fixture',true,current_date),
   ('_fx_tolerance','Fixture: every package is unique exactly','Absolute wording, percentage tolerance.',
     'A','select 1::numeric','B','select 2::numeric',5,'elevated','fixture',true,current_date),
   ('_fx_broken_sql','Fixture: source does not run','Source A references nothing.',
     'A','select count(*)::numeric from table_that_does_not_exist','B','select 1::numeric',0,'elevated','fixture',true,current_date),
   ('_fx_incomplete','','','A','select 1::numeric','B','select 2::numeric',0,'elevated','',true,current_date)
  on conflict (check_key) do nothing;

  create temp table if not exists _fxres(k text, p text) on commit drop;
  delete from _fxres;
  insert into _fxres select s.check_key, s.problem from tg_verification_checks_sane() s
    where s.check_key like '\_fx\_%';

  delete from verification_checks where check_key like '\_fx\_%';

  for i in 1 .. array_length(fx,1) loop
    fixture := fx[i][1];
    expected_problem := fx[i][2];
    caught := exists (select 1 from _fxres r where r.k = fx[i][1] and r.p = fx[i][2]);
    return next;
  end loop;
end $function$;

comment on function public.tg_verification_checks_sane_selftest() is
  'Proves tg_verification_checks_sane() still catches. Inserts five deliberately broken checks, '
  'asserts each is flagged by the correct rule, removes them. If a fixture escapes, the auditor '
  'is blind and its clean sheet is worthless - so the nightly job refuses to report.';

-- THE NIGHTLY JOB. Self-test first; only then audit; raise a finding if anything is wrong.
create or replace function public.tg_audit_the_checks()
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_missed int; v_problems int; v_run bigint; v_detail text;
begin
  select count(*) into v_missed from tg_verification_checks_sane_selftest() where not caught;

  if v_missed > 0 then
    insert into watchdog_runs default values returning id into v_run;
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run,'meta_check_blind','critical',
      'THE CHECK AUDITOR HAS GONE BLIND: ' || v_missed || ' of 5 self-test fixtures escaped detection',
      'tg_verification_checks_sane()','Whoever last edited the auditor','Since that edit',
      'This function certifies every other verification check as sound. If it stops catching, it '
      'returns a clean sheet while defective checks run unnoticed - which is how five of nineteen '
      'checks were found lying on 9 Aug 2026. A blind auditor is worse than none, because it '
      'manufactures confidence.',
      'Five deliberately broken checks are inserted, audited and removed. Each must be caught by '
      'its specific rule.',
      'Run: select * from tg_verification_checks_sane_selftest(); and repair whichever rule stopped firing.',
      v_missed || ' of 5 fixtures escaped', v_missed, 'settings','meta check auditor blind')
    on conflict (fingerprint) where (fingerprint is not null) do update set
      severity=excluded.severity, what=excluded.what, record_count=excluded.record_count, run_id=excluded.run_id;
    return 'SELF-TEST FAILED: ' || v_missed || ' of 5 fixtures escaped. Audit not run.';
  end if;

  select count(*), string_agg(distinct check_key || ' (' || problem || ')', '; ')
    into v_problems, v_detail from tg_verification_checks_sane();

  if v_problems > 0 then
    insert into watchdog_runs default values returning id into v_run;
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text)
    values (v_run,'verification_checks_defective','elevated',
      v_problems || ' verification check(s) cannot be trusted: ' || left(coalesce(v_detail,''),400),
      'verification_checks','Whoever wrote the check','Since the check was written',
      'These are the checks that derive every fact two ways. A defective one either certifies a '
      'fault as fine or shouts permanently until people stop reading the board. On 9 Aug 2026 five '
      'of nineteen were defective and all three of the worst arrived in a single batch, written and '
      'scheduled and never verified.',
      'Each enabled check is audited for seven failure modes: cannot fail, incomplete, population '
      'mismatch, tolerance on an identity, source fails to run, never run, cannot pass.',
      'select * from tg_verification_checks_sane(); then fix the SQL, the tolerance or the severity.',
      v_problems || ' defective of ' || (select count(*) from verification_checks where enabled),
      v_problems,'settings','verification check defective meta')
    on conflict (fingerprint) where (fingerprint is not null) do update set
      severity=excluded.severity, what=excluded.what, the_arithmetic=excluded.the_arithmetic,
      record_count=excluded.record_count, run_id=excluded.run_id;
  end if;

  return 'self-test 5/5 passed; ' || v_problems || ' defective check(s) found';
end $function$;

comment on function public.tg_audit_the_checks() is
  'Nightly. Proves the auditor still catches, then audits every verification check and raises a '
  'watchdog finding for any that cannot be trusted. Refuses to report if its own self-test fails.';;
