-- WAVE 2, second attempt. The first was rolled back by its own canary, and the canary was right.
--
-- v_pay_rate_confidence is an UNGROUPED aggregate over employee_rates, so it returns exactly one
-- row no matter what the caller can see. Enforcing row-level security on it turned
-- `count(*) filter (where provisional) = 0` into TRUE, so safe_to_quote became true and the
-- message became "Every rate has been approved by a person. Payroll figures can be quoted."
--
-- Zero visible rows was being read as zero problems. That is worse than the disclosure it was
-- meant to fix: the leak shows a manager numbers they should not see, whereas this would tell
-- anyone that 21 unapproved placeholder rates are approved and quotable. Absence and no-access
-- are not the same thing, and this view could not tell them apart.
--
-- The bug is not caused by row-level security; security only revealed it. An empty
-- employee_rates table produces the same false all-clear today. So it is fixed on its own
-- terms first, and only then made to enforce policy.
--
-- Column list and order preserved exactly, because CREATE OR REPLACE cannot reorder or rename.
create or replace view public.v_pay_rate_confidence as
select count(*)                                                              as rates_on_file,
       count(*) filter (where provisional)                                   as provisional,
       count(*) filter (where not provisional)                               as approved,
       round(100.0 * count(*) filter (where provisional)::numeric
             / nullif(count(*), 0)::numeric, 1)                              as pct_provisional,
       /* An empty result is never an all-clear. It takes at least one visible rate, all of
          them approved, to say payroll can be quoted. */
       (count(*) > 0 and count(*) filter (where provisional) = 0)            as safe_to_quote,
       case
         when count(*) = 0 then
           'NO RATES ARE VISIBLE TO YOU. Either none are on file, or your account is not '
           || 'cleared to read compensation. This is NOT an all-clear — nothing here says any '
           || 'rate has been approved, and no payroll or margin figure should be quoted from it.'
         when count(*) filter (where provisional) = 0 then
           'Every rate has been approved by a person. Payroll figures can be quoted.'
         else
           'ESTIMATE ONLY. ' || count(*) filter (where provisional) || ' of ' || count(*)
           || ' rates are placeholders nobody has approved. Any payroll, labour cost or margin '
           || 'figure built on these is an estimate and must be presented as one. Human '
           || 'Resources replaces them during onboarding.'
       end                                                                   as how_to_present_it
  from employee_rates;

do $$
declare
  v          text;
  n          int;
  claims_ok  boolean;
  offenders  text[] := '{}';
  grouped    text[] := array['v_payroll_journal','v_payroll_ytd','v_payroll_week'];
begin
  foreach v in array grouped loop
    execute format('alter view public.%I set (security_invoker = true)', v);
  end loop;
  alter view public.v_pay_rate_confidence set (security_invoker = true);

  set local role authenticated;

  /* Grouped views must collapse to nothing without an HR or executive claim. */
  foreach v in array grouped loop
    begin
      execute format('select count(*) from (select 1 from public.%I limit 5) t', v) into n;
    exception when others then n := 0;
    end;
    if n > 0 then offenders := offenders || format('%s (%s rows)', v, n); end if;
  end loop;

  /* The aggregate always returns its one row. What must be true is that it reports nothing
     visible AND refuses to call that safe. This asserts the honesty fix, not just the lockdown. */
  begin
    select rates_on_file = 0 and safe_to_quote is not true
      into claims_ok from public.v_pay_rate_confidence;
  exception when others then claims_ok := true;
  end;
  if not coalesce(claims_ok, false) then
    offenders := offenders || 'v_pay_rate_confidence (reports rates, or calls an empty read safe)';
  end if;

  reset role;

  if array_length(offenders, 1) > 0 then
    raise exception 'ROLLED BACK — %', array_to_string(offenders, ', ');
  end if;

  raise notice 'wave 2: 4 payroll views now honour the policies already written for them';
end $$;;
