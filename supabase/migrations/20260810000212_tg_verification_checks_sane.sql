-- THE META-CHECK: who checks the checks.
--
-- WHY THIS EXISTS. On 9 Aug 2026 five of nineteen verification checks were found to be lying,
-- in three different directions:
--   packages-unique-on-tag        read GREEN on 7 real duplicates (tolerance 0.5% on an identity)
--   lab-samples-shipped-vs-held   read 4,148% apart by comparing every package on a
--                                 sample-bearing manifest against the samples themselves
--   packages-shipped-vs-received  permanently red because it mixed normal in-transit traffic
--                                 with genuinely stuck shipments
--   room-name-alone-is-not-a-room could never pass, sitting in the fault list as a regression
--   held-package-counted-once     did not exist, so a real double-count went unmeasured
--
-- All three of the worst arrived in ONE BATCH OF ELEVEN on 8 Aug: written, inserted, scheduled,
-- never verified. guard-fixtures.mjs proves the FILE guards still catch, and has zero references
-- to verification_checks. No file in the repository tests their SQL. CI holds no database
-- credential, so a repo-side gate physically cannot reach them.
--
-- THE GUARDS GUARD THE REPO. THE CHECKS LIVE IN THE DATABASE. NOTHING SPANNED THE GAP.
-- This does. It runs where the checks are.
--
-- A check that cannot fail proves nothing (rule C0b) - and a check that cannot pass proves
-- nothing either, because its signal never changes. Both are found here.

create or replace function public.tg_verification_checks_sane()
 returns table(check_key text, problem text, severity text, detail text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_a numeric; v_b numeric;
  v_norm_a text; v_norm_b text;
  v_agrees int; v_runs int;
  v_err text;
begin
  create temp table if not exists _sane(check_key text, problem text, severity text, detail text)
    on commit drop;
  delete from _sane;

  for r in select * from verification_checks where enabled loop

    /* Normalise whitespace and case so formatting differences do not hide an identical pair. */
    v_norm_a := lower(regexp_replace(coalesce(r.source_a_sql,''), '\s+', ' ', 'g'));
    v_norm_b := lower(regexp_replace(coalesce(r.source_b_sql,''), '\s+', ' ', 'g'));

    /* S1 - CANNOT FAIL. Two identical sources always agree. Rule C0b, exactly. */
    if v_norm_a = v_norm_b and v_norm_a <> '' then
      insert into _sane values (r.check_key, 'CANNOT FAIL',
        'critical', 'Both sources run identical SQL, so the check always agrees and proves nothing.');
    end if;

    /* S2 - COMPLETENESS. A check nobody can interpret cannot be acted on (rule A3). */
    if coalesce(r.what_it_proves,'') = '' or coalesce(r.title,'') = '' or coalesce(r.owner,'') = '' then
      insert into _sane values (r.check_key, 'INCOMPLETE',
        'elevated', 'Missing title, what_it_proves or owner. A finding with no owner is a finding nobody closes.');
    end if;

    /* S3 - POPULATION MISMATCH. THE ERROR THIS PROJECT KEEPS MAKING.
       One side aggregates a quantity, the other counts rows. That is how
       lab-samples-shipped-vs-held reported 4,148%: sum(PackageCount) over manifests
       against count(*) of samples. Two populations, one comparison. */
    if (v_norm_a like '%sum(%' and v_norm_b like '%count(%' and v_norm_b not like '%sum(%')
    or (v_norm_b like '%sum(%' and v_norm_a like '%count(%' and v_norm_a not like '%sum(%') then
      insert into _sane values (r.check_key, 'POPULATION MISMATCH',
        'critical', 'One side SUMS a quantity and the other COUNTS rows. These are different populations '
          || 'unless every row carries exactly one unit. This is the error that produced a false 4,148% gap.');
    end if;

    /* S4 - TOLERANCE ON AN IDENTITY. "every", "exactly", "unique", "never" are absolutes.
       A percentage tolerance on one lets a real fault read green, as it did on 7 duplicate tags. */
    if coalesce(r.tolerance_pct,0) > 0
       and (lower(r.title) ~ '(exactly|unique|every|never|no )'
         or lower(coalesce(r.what_it_proves,'')) ~ 'tolerance 0') then
      insert into _sane values (r.check_key, 'TOLERANCE ON AN IDENTITY',
        'critical', 'Title or description states an absolute, but tolerance is ' || r.tolerance_pct
          || '%. An identity invariant is binary; a percentage lets a real fault read green.');
    end if;

    /* S5 - DOES IT ACTUALLY RUN? Both sides are executed. A check that errors is not a check,
       and until now nothing noticed - it would simply never write a run row. */
    begin
      execute r.source_a_sql into v_a;
    exception when others then
      v_err := sqlerrm;
      insert into _sane values (r.check_key, 'SOURCE A FAILS TO RUN', 'critical', left(v_err,180));
      v_a := null;
    end;
    begin
      execute r.source_b_sql into v_b;
    exception when others then
      v_err := sqlerrm;
      insert into _sane values (r.check_key, 'SOURCE B FAILS TO RUN', 'critical', left(v_err,180));
      v_b := null;
    end;

    /* S6 - NEVER RUN. Enabled, scheduled, and no run row has ever been written. */
    select count(*) into v_runs from verification_runs vr where vr.check_key = r.check_key;
    if v_runs = 0 then
      insert into _sane values (r.check_key, 'NEVER RUN',
        'elevated', 'Enabled but has never produced a run. A check that does not run enforces nothing.');
    end if;

    /* S7 - CANNOT PASS. Disagreed on every run and never once agreed. Either it is broken, or it
       is a standing fact that belongs at 'watch' severity where it will not read as a regression.
       Ten runs is enough to distinguish a persistent condition from a bad week. */
    if v_runs >= 10 then
      select count(*) into v_agrees from verification_runs vr
        where vr.check_key = r.check_key and vr.verdict = 'agree';
      if v_agrees = 0 and r.severity in ('critical','elevated') then
        insert into _sane values (r.check_key, 'CANNOT PASS',
          'elevated', 'Has never agreed in ' || v_runs || ' runs while marked ' || r.severity
            || '. A permanent red teaches people to ignore the board. Fix it, or demote it to watch '
            || 'and say in what_it_proves that disagreement is expected.');
      end if;
    end if;

  end loop;

  return query select s.check_key, s.problem, s.severity, s.detail from _sane s
    order by case s.severity when 'critical' then 0 else 1 end, s.check_key;
end $function$;

comment on function public.tg_verification_checks_sane() is
  'Audits every enabled verification_check for the seven ways one can lie: cannot fail, '
  'incomplete, population mismatch, tolerance on an identity, fails to run, never run, cannot '
  'pass. Written 9 Aug 2026 after five of nineteen checks were found defective in one sitting. '
  'It runs in the database because CI holds no credential and cannot reach them.';;
