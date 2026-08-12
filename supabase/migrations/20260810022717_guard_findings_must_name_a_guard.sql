-- THE META-TRAP, ENFORCED. brain/DATA_TRAPS_REGISTER.md section E, which calls itself the
-- worst trap in the register:
--
--   "A decision recorded is not a decision implemented. Rule: a decision is not closed until
--    something in code, config or a check enforces it. Write the guard in the same session as
--    the decision, or record plainly that it is unguarded. THIS REGISTER'S GUARD COLUMN IS
--    THAT TEST."
--
-- watchdog_findings has carried a guard_recommendation column the whole time. Measured 9 Aug
-- 2026: 106 findings, ZERO name a guard, and 80 of those are critical or elevated. So every
-- one of them can recur, and the register's own closing test has never been applied to the
-- findings the register exists to prevent.
--
-- A RATCHET, NOT A CLIFF. A trigger demanding guard_recommendation on write would reject
-- every existing writer - tg_nightly_platform_check, the sync monitors, all of them - and a
-- gate red on arrival is a gate somebody switches off. So the current 80 are recorded as a
-- baseline that may FALL and may never RISE, exactly as no-hardcoded-numbers.mjs does.
--
-- NO HARDWIRING (owner, 9 Aug): the baseline is a row, not a literal.
insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values ('findings_without_guard_baseline', 80, 'findings',
  'Serious findings that name no preventing guard',
  'How many critical or elevated findings currently carry no guard_recommendation. This number may FALL and may never RISE. Each one is a problem that can happen again because nothing was built to stop it.',
  'Measured 9 Aug 2026: 106 findings in total, 0 naming a guard, 80 of them critical or elevated.',
  'Agent - measured', 'measured',
  'Lower this as findings gain a guard. Raising it means accepting that more problems may recur, which is the owner''s decision and not an agent''s.')
on conflict (key) do update set
  value = excluded.value, what_it_means = excluded.what_it_means,
  where_it_came_from = excluded.where_it_came_from, evidence_note = excluded.evidence_note,
  updated_at = now();

create or replace function public.tg_guard_findings_name_a_guard()
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_now int; v_base int; v_run bigint; v_worst text;
begin
  select count(*) into v_now
  from watchdog_findings
  where guard_recommendation is null and severity in ('critical','elevated');

  v_base := coalesce(f_rule('findings_without_guard_baseline'), 80)::int;

  /* The number improved. Lower the baseline so the gain is locked in and cannot be given
     back quietly - the same ratchet discipline the repository gates use. */
  if v_now < v_base then
    update conversion_factors
      set value = v_now, updated_at = now(),
          evidence_note = 'Ratcheted down automatically on ' || current_date
            || ' from ' || v_base || ' to ' || v_now || '. May fall, may never rise.'
    where key = 'findings_without_guard_baseline';
    v_base := v_now;
  end if;

  select string_agg(left(what, 70), '; ')
    into v_worst
  from (select what from watchdog_findings
        where guard_recommendation is null and severity = 'critical'
        order by observed_at limit 3) oldest;

  if v_now > v_base then
    insert into watchdog_runs default values returning id into v_run;
    insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
      who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, record_count, drill, search_text, guard_recommendation)
    values (v_run, 'findings_without_a_guard', 'elevated',
      v_now || ' serious findings name no guard, above the baseline of ' || v_base,
      'watchdog_findings.guard_recommendation',
      'The agent that raised each finding',
      'Since each finding was raised',
      'DATA_TRAPS_REGISTER section E calls this the worst trap in the register: a decision '
      'recorded is not a decision implemented. A finding with no guard is a problem that will '
      'happen again - proven three times already, when sales endpoints "permanently disabled" '
      'on 6 Aug were still firing 401s on 7 Aug.',
      'Counted findings at critical or elevated severity where guard_recommendation is null, '
      'against an owner-editable baseline that may fall and may never rise.',
      'On each finding, name what would stop it recurring - a check, a constraint, a hook, a '
      'config row - or write plainly that it is unguarded and why. Both are acceptable; silence '
      'is not.',
      v_now || ' unguarded of ' || (select count(*) from watchdog_findings
        where severity in ('critical','elevated')) || ' serious; baseline ' || v_base
        || case when v_worst is not null then '. Oldest criticals: ' || v_worst else '' end,
      v_now, 'settings', 'finding without guard recurrence meta trap',
      'This finding guards itself: tg_guard_findings_name_a_guard(), cron job '
      'guard-findings-named, ratcheting against findings_without_guard_baseline.')
    on conflict (fingerprint) where (fingerprint is not null) do update set
      severity = excluded.severity, what = excluded.what,
      the_arithmetic = excluded.the_arithmetic, record_count = excluded.record_count,
      run_id = excluded.run_id;
    return v_now || ' unguarded, ABOVE baseline ' || v_base || ' - finding raised';
  end if;

  return v_now || ' serious findings unguarded (baseline ' || v_base || ', not worse)';
end $function$;

comment on function public.tg_guard_findings_name_a_guard() is
  'Enforces the closing test of DATA_TRAPS_REGISTER section E: a finding must name the guard '
  'that stops it recurring, or say plainly that it is unguarded. Ratchets against an '
  'owner-editable baseline - the count may fall and may never rise. It carries its own '
  'guard_recommendation, because a guard that does not meet its own rule is not a guard.';;
