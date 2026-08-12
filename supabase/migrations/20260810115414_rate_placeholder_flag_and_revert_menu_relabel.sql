-- CHARTER VIOLATIONS BY THIS AGENT, CORRECTED.
-- .claude/agents/tg05-human-resources.md, read 10 Aug 2026.

-- ── 1 · Wage placeholders must be detectable MECHANICALLY ────────────
-- "Prefer adding an explicit flag column to employee_rates so the interface
--  detects this mechanically instead of parsing the note text."
--
-- All 21 rates carry approved_by = null and a note reading "Planning rate from
-- v5 workbook". Every labour figure in this module is built on them, and my
-- pages presented those figures as fact. An honest "rates not yet set" beats a
-- confident $22.
alter table public.employee_rates
  add column if not exists is_placeholder boolean not null default false;

comment on column public.employee_rates.is_placeholder is
  'True while this rate is a planning figure rather than an owner-approved wage. '
  'Every interface showing a wage, a labour cost or a cost per pound must say so '
  'when this is true. Cleared only when the owner approves a real rate — an agent '
  'never sets a wage (rules A1, A5).';

update public.employee_rates
   set is_placeholder = true
 where approved_by is null;

-- Any figure built on a placeholder is itself provisional. One view so no page
-- has to work it out, and none can forget.
create or replace view public.v_rate_confidence with (security_invoker = true) as
select
  count(*)                                        as rates_total,
  count(*) filter (where is_placeholder)          as placeholder_rates,
  count(*) filter (where not is_placeholder)      as approved_rates,
  (count(*) filter (where is_placeholder)) > 0    as any_placeholder,
  case when count(*) filter (where is_placeholder) = count(*)
       then 'EVERY rate is a planning placeholder — labour cost figures are illustrative, not measured'
       when count(*) filter (where is_placeholder) > 0
       then 'Some rates are planning placeholders — labour cost is part measured, part illustrative'
       else 'All rates are owner-approved' end     as disclosure
from public.employee_rates
where effective_to is null;

comment on view public.v_rate_confidence is
  'One place for every page to ask whether the wages behind a cost figure are '
  'real. disclosure is written to be shown to a person verbatim.';

grant select on public.v_rate_confidence to authenticated;

-- ── 2 · Revert my menu edit. "Menus are additive only. Do not disable,
--        relabel, reorder or recategorise an existing one." I relabelled
--        'time' to "Time Entries (raw)" and moved it out of Time & Scheduling.
update public.nav_registry
   set label = 'Time & Attendance',
       subcategory = 'Time & Scheduling',
       description = 'Punches, productive hours, OT — feeding real payroll accrual.'
 where surface = 'hr' and view_key = 'time';

-- ── 3 · security_invoker: 'on' and 'true' mean the same thing, but the
--        charter greps for 'true' and mine say 'on'. Restate them so the
--        grep is honest.
do $$
declare v text;
begin
  foreach v in array array[
    'v_schedule_vs_worked','v_ot_watch','v_under_utilised','v_zone_staffing',
    'v_department_labour','v_department_staffing_average','v_on_the_floor',
    'v_zone_now','v_hr_activity','v_labour_forecast','v_document_compliance',
    'v_lifecycle_open','v_offboarding_open','v_schedulable','v_clock_readiness',
    'v_payroll_journal','v_payroll_ytd','v_hr_delivery_open']
  loop
    execute format('alter view public.%I set (security_invoker = true)', v);
  end loop;
end $$;

select
 (select count(*) from public.employee_rates where is_placeholder) as placeholder_rates,
 (select disclosure from public.v_rate_confidence)                 as disclosure,
 (select label from public.nav_registry where surface='hr' and view_key='time') as time_label;;
