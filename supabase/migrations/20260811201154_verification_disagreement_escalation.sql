-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-003 (reviewers V, X, W).
--
-- WHY. The verification suite has run 311 times and 12 of its 23 checks are currently
-- DISAGREE - three of them critical, one of them 'anon-cannot-read' reporting 6 relations
-- readable without signing in. tg_auditor_pass() writes ONE aggregate row to
-- conformance_ledger saying "11 of 23 agree". No individual check has ever named itself in
-- watchdog_findings, alert_outbox or actions_register. Measured: 0 findings, 0 alerts,
-- 0 actions cite any check_key. The suite measures correctly and reports into a vacuum.
-- That is the definition of a silent failure, and it is exactly what the standing watch
-- mandate exists to stop.
--
-- WHAT THIS DOES. Turns every disagreement into a named, owned, fingerprinted finding, and
-- clears it automatically when the check goes green again. Adds nothing to the measurement
-- path - tg_verify() is untouched, so this cannot change a verdict, only publish one.
--
-- PROCESS CHECKS ARE RESPECTED. A check with measures_a_process = true is measuring
-- something legitimately in flight (packages shipped but not yet received). It only escalates
-- once the disagreement has outlived settles_within. Three checks carry that flag and all
-- three already declare an in_flight_rule, so none of them can raise a spurious finding.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It does not write to alert_outbox. There are already
-- 239 unread in-app alerts and no email provider configured; adding to that queue would be
-- noise wearing the costume of action.
--
-- UNDO: select cron.unschedule('verification-escalate');
--       drop function tg_verification_escalate();
--       delete from watchdog_findings where fingerprint like 'verify:%';
--       alter table watchdog_findings drop column cleared_at;

-- Additive, nullable, breaks no existing reader. Findings had no lifecycle at all before
-- this: a finding could be raised but never recorded as resolved.
alter table watchdog_findings add column if not exists cleared_at timestamptz;

comment on column watchdog_findings.cleared_at is
 'Set when the condition that raised this finding no longer holds. NULL means still open. '
 'Written automatically for fingerprints matching verify:%, which are derived from the '
 'verification suite and re-evaluated every time it runs. The finding row is never deleted - '
 'verification_runs keeps the full history and all data is kept forever.';

create or replace function public.tg_verification_escalate()
returns table (check_key text, action text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_streak_start timestamptz; v_open boolean;
begin
  for r in
    select c.check_key, c.title, c.what_it_proves, c.severity, c.owner,
           c.tolerance_pct, c.measures_a_process, c.in_flight_rule,
           coalesce(c.settles_within, interval '0') as settles_within,
           c.source_a_label, c.source_b_label,
           lr.value_a, lr.value_b, lr.pct_apart, lr.verdict, lr.ran_at
      from verification_checks c
      join lateral (select * from verification_runs vr
                     where vr.check_key = c.check_key
                     order by vr.ran_at desc limit 1) lr on true
     where c.enabled
  loop
    -- Start of the CURRENT consecutive non-agreeing streak: the first disagreement after the
    -- last time this check agreed. A check that has never agreed streaks from its first run.
    select min(vr.ran_at) into v_streak_start
      from verification_runs vr
     where vr.check_key = r.check_key
       and upper(vr.verdict) <> 'AGREE'
       and vr.ran_at > coalesce((select max(a.ran_at) from verification_runs a
                                  where a.check_key = r.check_key and upper(a.verdict) = 'AGREE'),
                                '-infinity'::timestamptz);

    v_open := upper(r.verdict) <> 'AGREE'
              and (not coalesce(r.measures_a_process, false)
                   or now() - coalesce(v_streak_start, r.ran_at) > r.settles_within);

    if v_open then
      insert into watchdog_findings (
        fingerprint, severity, what, where_it_is, who_is_accountable, when_it_started,
        why_it_matters, how_it_was_detected, what_to_do, the_arithmetic, record_count,
        search_text, cleared_at)
      values (
        'verify:' || r.check_key,
        r.severity,
        format('Verification check "%s" disagrees. %s says %s; %s says %s.',
               r.check_key, r.source_a_label, r.value_a, r.source_b_label, r.value_b),
        'verification_checks / verification_runs, check_key = ' || r.check_key,
        coalesce(nullif(r.owner, ''), 'Agent W'),
        v_streak_start,
        coalesce(nullif(r.what_it_proves, ''),
                 'Two independent derivations of the same figure do not match, so at least one is wrong.'),
        'tg_verify() ran the two SQL sources this check declares and compared them. '
        || 'tg_verification_escalate() raised this because the disagreement outlived its settling window.',
        'Derive both sides by hand and decide which one is wrong, then fix that source. '
        || 'Never widen tolerance_pct to make the check pass - that hides the defect instead of '
        || 'removing it. If the check itself is wrong, log it in check_defect and correct the check.',
        format('%s vs %s, %s%% apart against a tolerance of %s%%',
               r.value_a, r.value_b, round(coalesce(r.pct_apart, 0), 2), r.tolerance_pct),
        round(abs(coalesce(r.value_a, 0) - coalesce(r.value_b, 0)))::bigint,
        r.check_key || ' ' || coalesce(r.title, '') || ' verification disagreement',
        null)
      on conflict (fingerprint) where fingerprint is not null do update set
        severity        = excluded.severity,
        what            = excluded.what,
        the_arithmetic  = excluded.the_arithmetic,
        record_count    = excluded.record_count,
        when_it_started = excluded.when_it_started,
        observed_at     = now(),
        cleared_at      = null;
      return query select r.check_key, 'raised'::text;
    else
      update watchdog_findings
         set cleared_at = now()
       where fingerprint = 'verify:' || r.check_key and cleared_at is null;
      if found then
        return query select r.check_key, 'cleared'::text;
      end if;
    end if;
  end loop;
end $function$;

comment on function public.tg_verification_escalate() is
 'Publishes verification disagreements as findings. One finding per check_key, fingerprinted '
 'verify:<check_key>, refreshed with current numbers on every run and cleared automatically '
 'when the check agrees again. Respects measures_a_process/settles_within so genuinely '
 'in-flight quantities do not raise findings. Reads the suite; never writes to it.';

-- Runs ten minutes after the verification suite, so it always publishes fresh verdicts.
select cron.unschedule('verification-escalate')
 where exists (select 1 from cron.job where jobname = 'verification-escalate');

select cron.schedule('verification-escalate', '35 5,17 * * *',
                     'select count(*) from tg_verification_escalate()');;
