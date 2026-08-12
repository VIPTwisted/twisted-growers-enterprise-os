/* PLACEHOLDER RATES ARE FINE. QUOTING THEM AS REAL IS NOT.

   Owner, 9 August 2026: "yes use these rates for now these will be edited by HR
   and all employee data and information will be updated and entered during
   onboarding."

   Agreed, and the risk is not the placeholder - it is that a payroll forecast
   built on it gets quoted in a meeting as though it were payroll. Seventeen of
   twenty-one staff carry the same $22, which is not a wage, it is a shrug, and
   every view downstream currently presents it with exactly the same confidence
   as a rate somebody actually approved.

   This is the failure that has cost the most on this platform: not wrong data,
   but data that does not say what it is. $1,317,836 of purchases read as revenue
   because a column did not say which direction it was. A table read as empty
   because a zero did not say it meant "not allowed". The fix is the same each
   time - make the DATA carry the caveat, so it survives being copied into a
   spreadsheet by somebody who was not in this conversation.

   provisional is DERIVED, not typed. A flag somebody has to remember to set is a
   flag that will be wrong: it is true whenever no human approved the rate, which
   is exactly the condition that makes it a placeholder. Approve a rate and it
   stops being provisional with nothing else to do. */
alter table employee_rates
  add column if not exists provisional boolean
  generated always as (approved_by is null) stored;

comment on column employee_rates.provisional is
  'True while no person has approved this rate. DERIVED from approved_by, not typed - a flag somebody must remember to set is a flag that will be wrong. Owner ruling 9 Aug 2026: placeholders stay until Human Resources enters real rates during onboarding. Anything computed from a provisional rate is an estimate and must say so.';

/* One place that answers "can I quote a payroll number yet". Every figure built
   on these rates should read this first, and any screen showing one should show
   this beside it. */
create or replace view v_pay_rate_confidence as
select
  count(*)                                          as rates_on_file,
  count(*) filter (where provisional)                as provisional,
  count(*) filter (where not provisional)            as approved,
  round(100.0 * count(*) filter (where provisional)
        / nullif(count(*), 0), 1)                    as pct_provisional,
  (count(*) filter (where provisional) = 0)          as safe_to_quote,
  case
    when count(*) filter (where provisional) = 0
      then 'Every rate has been approved by a person. Payroll figures can be quoted.'
    else 'ESTIMATE ONLY. ' || count(*) filter (where provisional) || ' of ' || count(*) ||
         ' rates are placeholders nobody has approved. Any payroll, labour cost or margin figure built on these is an estimate and must be presented as one. Human Resources replaces them during onboarding.'
  end                                                as how_to_present_it
from employee_rates;

comment on view v_pay_rate_confidence is
  'Whether a payroll figure can be quoted yet. Read this before presenting any labour cost, and show it beside the number. A forecast built on placeholder rates is not wrong - it is an estimate - and the harm comes from presenting it as anything else.';

grant select on v_pay_rate_confidence to authenticated;

select rates_on_file, provisional, approved, pct_provisional, safe_to_quote
from v_pay_rate_confidence;;
