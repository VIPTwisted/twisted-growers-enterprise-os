/* ═══════════════════════════════════════════════════════════════════════════
   C · THE HARVEST CONTROL BANNER — one definition, read by every page
   Branch `claude-c/harvest-control-banner`, 28 August 2026.
   NOT FOR MAIN. Owner holds the merge and the apply.

   docs/HARVEST_CONTROL_LAW.md, owner 28 Aug 2026: "schedules, dried weight, and
   policy are not optional. Ignored variance is a management failure." The law
   asks for an in-app banner on Cultivation home and on the Tower for anything at
   severity 3 or above.

   WHY A VIEW AND NOT FOUR READS ON EACH PAGE. Two pages must show the same four
   numbers. Computed in the browser that is two definitions of each, and the day
   one page is edited they disagree silently — the defect this platform keeps
   producing. One view, read twice, cannot drift.

   NOTHING HERE IS HARDCODED. The open limit is `harvest_open_max_days` and the
   contracted floor is `monthly_min_dried_flower_lb`, both owner rows in
   `conversion_factors`, both read through `f_rule()`. Change the row and the
   banner moves.

   NEVER BLEND A SCHEDULED POUND INTO A METRC POUND. The law is explicit. Line 3
   holds the two side by side — the contracted floor is TG policy, the MTD figure
   is Metrc's own packaged weight — and reports the gap between them. It never
   adds them, and it never prints the target as though it were the achievement.

   AN ABSENT POLICY ROW IS NOT A ZERO. If `monthly_min_dried_flower_lb` is
   missing, line 3 returns a null count and says the floor has never been set. It
   does not fall back to a number, and it does not disappear — a contract nobody
   recorded is itself the finding.

   READ-ONLY. No Metrc write, no nav entry, no existing object altered.
   ═══════════════════════════════════════════════════════════════════════════ */

begin;

create or replace view v_harvest_control_banner as
with policy as (
  select f_rule('harvest_open_max_days')        as open_max_days,
         f_rule('monthly_min_dried_flower_lb')  as contracted_min_lb
),
/* Metrc's own packaged weight for the month so far, derived exactly as
   f_department_dashboard derives "produced from our harvests": packages born of
   a harvest rather than split from another package, weight units only. */
mtd as (
  select coalesce(round(sum(f_to_pounds(
           coalesce((p.raw ->> 'CreatedQuantity')::numeric, 0),
           coalesce(nullif(p.raw ->> 'UnitOfMeasureName', ''), 'Grams'))), 1), 0) as packaged_lb
  from metrc_packages p
  where nullif(p.raw ->> 'SourceHarvestNames', '') is not null
    and nullif(p.raw ->> 'SourcePackageLabels', '') is null
    and f_is_weight(coalesce(nullif(p.raw ->> 'UnitOfMeasureName', ''), 'Grams'))
    and (p.raw ->> 'PackagedDate')::date >= date_trunc('month', current_date)::date
    and (p.raw ->> 'PackagedDate')::date <= current_date
),
lines as (
  /* 1 · Open past the owner's limit. Law §1, and queue 4 already lists them. */
  select 1 as ord,
         'open_past_limit'::text as line_key,
         'Harvests open past the owner limit'::text as headline,
         (select count(*) from v_moisture_accounting m, policy pol
           where m.finished is null
             and (current_date - m.harvest_start_date) > pol.open_max_days)::numeric as measure,
         'harvests'::text as unit,
         'harvest_issues'::text as drill,
         ('Open longer than the owner limit of ' || (select open_max_days from policy)
           || ' days, read from harvest_open_max_days. A room held by a finished harvest '
           || 'cannot take its next planting, which is the most expensive loss in cultivation.')::text as basis
  union all
  /* 4 · Wet recorded, dry never recorded. Law §4: MISSING, not zero. */
  select 2, 'wet_no_dry',
         'Wet weight recorded, nothing packaged yet',
         (select count(*) from v_moisture_accounting m
           where m.finished is null
             and coalesce(m.wet_lb, 0) > 0
             and coalesce(m.packaged_lb, 0) = 0)::numeric,
         'harvests', 'grading',
         'Metrc holds a wet weight for these harvests and no packaged weight against them. '
         || 'The dry figure is MISSING, not zero — a harvest with a wet weight and no dry weight '
         || 'has not been measured, and it must never be read as a harvest that yielded nothing.'
  union all
  /* 3 · Contracted monthly floor against Metrc's packaged month to date. */
  select 3, 'mtd_vs_contract',
         'Dried weight this month against the contracted minimum',
         case when (select contracted_min_lb from policy) is null then null
              else greatest((select contracted_min_lb from policy) - (select packaged_lb from mtd), 0)
         end,
         'lb short', 'grading',
         case when (select contracted_min_lb from policy) is null
              then 'NO CONTRACTED MINIMUM HAS BEEN SET. monthly_min_dried_flower_lb does not exist in '
                   || 'conversion_factors, so there is nothing to measure the month against. A contract '
                   || 'nobody recorded is itself the finding; no floor is assumed here.'
              else 'TG policy floor ' || (select contracted_min_lb from policy) || ' lb against Metrc''s own '
                   || 'packaged dry weight of ' || (select packaged_lb from mtd) || ' lb since '
                   || to_char(date_trunc('month', current_date), 'DD Mon') || '. Two systems of record, shown '
                   || 'side by side and never added: the floor is policy, the weight is Metrc.'
         end
  union all
  /* 5 · The moisture queue's own need-action population. */
  select 4, 'moisture_need_action',
         'Moisture loss waiting to be recorded',
         (select count(*) from v_moisture_loss_register where needs_recording = true)::numeric,
         'harvests', 'moisture_loss_register',
         'Harvests the register says still need their moisture loss recorded. Until it is written, '
         || 'the mass balance for that harvest cannot close and the dry-equivalent is unproven.'
)
select
  l.ord, l.line_key, l.headline, l.measure, l.unit, l.drill, l.basis,
  /* Severity 3 and above is what the law says must reach the banner and
     alert_outbox. Nothing here invents a threshold: a line is severe when it has
     anything in it at all, because every one of these four is an exception
     population — the correct reading of all four is zero. */
  case when l.measure is null then 3          /* unmeasurable is not "fine" */
       when l.measure > 0     then 3
       else 1 end as severity,
  (l.measure is null) as not_measured
from lines l
order by l.ord;

comment on view v_harvest_control_banner is
  'The four harvest control lines of docs/HARVEST_CONTROL_LAW.md, one row each, for the Cultivation '
  'home and Tower banners. One definition read by both pages so they cannot drift. The open limit and '
  'the contracted floor are owner rows in conversion_factors read through f_rule; a missing floor '
  'returns a null measure and says so rather than assuming one. TG policy pounds and Metrc pounds are '
  'shown side by side and never added.';

commit;
