-- THE PHASE SPLIT. CEO RULES, LOCKED FROM C'S MAP. NOTHING IS SUMMED INTO 380.
--
-- NOT APPLIED. Held for APPLY PHASES. The contract view (20260829113029) is already live
-- and August still reads 244.0 vs 380 on it; this file only ADDS a companion object.
--
-- LAW: "Seed-to-sale harvest weight is recorded in PHASES. A pound is in exactly one
-- phase. Never sum phases into the contract column. Contract 380 = finished dried flower
-- only."
--
-- WHY IT IS A NEW OBJECT RATHER THAN MORE COLUMNS ON THE CONTRACT VIEW. Rule 3 changes
-- what the contract is compared against - own-harvest flower bucket, not
-- v_yield_vs_target.dried_flower_lb - and that is a different number from the 244.0 that
-- shipped an hour ago. Silently swapping the basis underneath a live column would be the
-- worst of both. So the new basis lands here beside the old one, both are shown, and the
-- owner can see the size of the difference before deciding to move the contract onto it.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RULE 1 - HARVEST LEVEL, FROM metrc_harvests ONLY.
-- wet, waste, TotalPackagedWeight, CurrentWeight, TotalRestoredWeight. Not from
-- v_monthly_yield: the CEO said metrc_harvests only, and this is the one place these five
-- are recorded together on one clock (the month the harvest FINISHED).
--
-- identity_break is PRINTED, NOT REPAIRED. Metrc maintains wet = waste + packaged +
-- current, so the residual should be ~0. Measured across the trailing year it is -0.1 to
-- +0.1, rounding only. A real value means the mirror disagrees with itself and somebody
-- should look - this view says so and changes nothing.
--
-- This also killed a column from the first draft. It derived "water loss" as that same
-- residual. It is not moisture: CurrentWeight IS the running balance, so the figure is ~0
-- by construction and measures nothing. Water leaves inside CurrentWeight as it falls
-- between snapshots and a month-grain mirror cannot see it. Shipping it as
-- phase_water_loss_lb would have invented a fabricated ~0 for a phase the owner listed,
-- which is exactly the "do not invent 0" the rule forbids. Water is NULL with evidence.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RULE 2 - PACKAGED SPLIT IS SECONDARY. HARVEST-SOURCED PACKAGES ONLY.
-- SourceHarvestNames present AND SourcePackageLabels null: made directly off a harvest,
-- never a repack. 1,048 such packages. ONE PACKAGE, ONE BUCKET - a single CASE, first
-- match wins, in the CEO's order. No regex counts: they overlap and would double-count
-- (716 names end 'Flower' and 54 of those end 'Bulk Flower').
--
--   1  WIP_Production      -> unclassified   (33)
--   2  Nature's Biomass    -> EXCLUDED, not biomass (6)
--   3  Fresh Frozen        -> ff             (112)
--   4  Shake/Trim | Bulk shake | ends Trim -> trim_shake
--   5  ends Flower | Bulk Flower | ends Buds/Bud -> flower
--   6  else                -> unclassified
--
-- ═══════════════════════════════════════════════════════════════════════════
-- RULE 3 - is_own_harvest, AND THE CONTRACT COMPARES ONLY own + flower.
-- SourceHarvestNames is a comma-separated list; a package is ours when any name in it
-- matches a metrc_harvests.name we hold. Third-party Bulk Flower is NOT 380.
--
-- RULE 4 - UOM to lb through f_to_pounds. A NULL unit yields NULL pounds, never 0.
-- RULE 5 - biomass is NULL. No guessing.
create or replace view public.v_harvest_phase_split
with (security_invoker = true) as
with months as (
  select (date_trunc('month', current_date) - (n || ' months')::interval)::date as month_date
  from generate_series(0, 12) as n
),
/* ── rule 1: the harvest record, one clock: the month it FINISHED ──────────── */
hv as (
  select date_trunc('month',
           coalesce((raw->>'FinishedDate')::date, harvest_start))::date          as month_date,
         count(*)                                                               as harvests,
         sum(case when nullif(raw->>'UnitOfWeightName','') is null then null
                  else f_to_pounds((raw->>'TotalWetWeight')::numeric,      raw->>'UnitOfWeightName') end) as wet_lb,
         sum(case when nullif(raw->>'UnitOfWeightName','') is null then null
                  else f_to_pounds((raw->>'TotalWasteWeight')::numeric,    raw->>'UnitOfWeightName') end) as waste_lb,
         sum(case when nullif(raw->>'UnitOfWeightName','') is null then null
                  else f_to_pounds((raw->>'TotalPackagedWeight')::numeric, raw->>'UnitOfWeightName') end) as packaged_lb,
         sum(case when nullif(raw->>'UnitOfWeightName','') is null then null
                  else f_to_pounds((raw->>'CurrentWeight')::numeric,       raw->>'UnitOfWeightName') end) as current_lb,
         sum(case when nullif(raw->>'UnitOfWeightName','') is null then null
                  else f_to_pounds((raw->>'TotalRestoredWeight')::numeric, raw->>'UnitOfWeightName') end) as restored_lb,
         count(*) filter (where nullif(raw->>'UnitOfWeightName','') is null)     as harvests_without_uom
  from public.metrc_harvests
  where coalesce((raw->>'FinishedDate')::date, harvest_start) is not null
  group by 1
),
/* ── rule 2 + 3: harvest-sourced packages, one package one bucket ──────────── */
pk as (
  select date_trunc('month', p.packaged_on)::date as month_date,
         case
           when p.raw #>> '{Item,Name}' ilike '%WIP_Production%'        then 'unclassified'
           when p.raw #>> '{Item,Name}' ilike '%Nature%Biomass%'        then 'excluded'
           when p.raw #>> '{Item,Name}' ilike '%Fresh Frozen%'          then 'ff'
           when p.raw #>> '{Item,ProductCategoryName}' ilike 'Shake/Trim%'
             or p.raw #>> '{Item,Name}' ilike '%Bulk shake%'
             or p.raw #>> '{Item,Name}' ~* 'Trim\s*$'                   then 'trim_shake'
           when p.raw #>> '{Item,Name}' ~* 'Flower\s*$'
             or p.raw #>> '{Item,Name}' ~* 'Bulk Flower\s*$'
             or p.raw #>> '{Item,Name}' ~* 'Buds?\s*$'                  then 'flower'
           else 'unclassified'
         end                                                            as bucket,
         exists (
           select 1
           from unnest(string_to_array(p.raw->>'SourceHarvestNames', ',')) sh
           join public.metrc_harvests h on h.name = btrim(sh)
         )                                                              as is_own_harvest,
         case when coalesce(nullif(p.raw->>'CreatedQuantityUnitOfMeasureAbbreviation',''), nullif(p.uom,'')) is null
              then null
              else f_to_pounds((p.raw->>'CreatedQuantity')::numeric,
                     coalesce(p.raw->>'CreatedQuantityUnitOfMeasureAbbreviation', p.uom)) end as lb
  from public.metrc_packages p
  where p.packaged_on is not null
    and nullif(p.raw->>'SourceHarvestNames','') is not null
    and nullif(p.raw->>'SourcePackageLabels','') is null
),
pk_m as (
  select month_date,
         sum(lb) filter (where bucket='flower'     and is_own_harvest)     as own_flower_lb,
         sum(lb) filter (where bucket='flower'     and not is_own_harvest) as third_party_flower_lb,
         sum(lb) filter (where bucket='ff')                               as ff_lb,
         sum(lb) filter (where bucket='trim_shake')                       as trim_shake_lb,
         sum(lb) filter (where bucket='unclassified')                     as unclassified_lb,
         count(*) filter (where bucket='excluded')                        as excluded_packages,
         count(*) filter (where lb is null)                               as packages_without_uom
  from pk group by 1
),
contract as (
  select value::numeric as contract_lb, nullif(btrim(set_by),'') as contract_set_by
  from public.conversion_factors where key = 'monthly_min_dried_flower_lb'
)
select
  to_char(m.month_date,'YYYY-MM')                    as month,
  m.month_date,

  /* ── rule 1: harvest level, month the harvest FINISHED ───────────────────── */
  h.harvests                                         as harvests_closed,
  round(h.wet_lb, 1)                                 as wet_lb_harvest_month,
  round(h.waste_lb, 1)                               as waste_lb_harvest_month,
  round(h.packaged_lb, 1)                            as packaged_total_lb_harvest_month,
  round(h.current_lb, 1)                             as current_weight_lb_harvest_month,
  round(h.restored_lb, 1)                            as restored_lb_harvest_month,
  round(h.wet_lb - coalesce(h.waste_lb,0) - coalesce(h.packaged_lb,0)
                 - coalesce(h.current_lb,0), 1)      as identity_residual_lb,
  case
    when h.wet_lb is null then null
    when abs(h.wet_lb - coalesce(h.waste_lb,0) - coalesce(h.packaged_lb,0)
                      - coalesce(h.current_lb,0)) > 1.0 then true
    else false
  end                                                as identity_break,
  h.harvests_without_uom,

  /* ── rule 2 + 3: packaged split, month the package was PACKAGED ──────────── */
  round(pm.own_flower_lb, 1)                         as own_flower_lb_packaged_month,
  round(pm.third_party_flower_lb, 1)                 as third_party_flower_lb_packaged_month,
  round(pm.ff_lb, 1)                                 as ff_lb_packaged_month,
  round(pm.trim_shake_lb, 1)                         as trim_shake_lb_packaged_month,
  round(pm.unclassified_lb, 1)                       as unclassified_lb_packaged_month,
  pm.excluded_packages                               as natures_biomass_packages_excluded,
  pm.packages_without_uom,

  /* ── rule 5 ──────────────────────────────────────────────────────────────── */
  null::numeric                                      as biomass_lb,
  'MISSING - no biomass source in Metrc. Nature''s Biomass is a supplier name and is excluded by CEO rule, not counted as biomass. Absent, not zero.'::text
                                                     as biomass_evidence_status,
  null::numeric                                      as water_lb,
  'MISSING - Metrc records no moisture field, and it is not recoverable as a residual: CurrentWeight IS the wet-minus-waste-minus-packaged balance, so that figure is ~0 by construction. Water leaves inside CurrentWeight between snapshots.'::text
                                                     as water_evidence_status,

  /* ── the contract, compared to own + flower ONLY ─────────────────────────── */
  c.contract_lb,
  case when c.contract_lb is null then 'missing' else 'owner-set' end as evidence_status,
  case when pm.own_flower_lb is not null and c.contract_lb is not null
       then round(pm.own_flower_lb - c.contract_lb, 1) end            as variance_lb,
  case
    when c.contract_lb is null       then 'NO CONTRACT ON FILE'
    when pm.own_flower_lb is null    then 'NO OWN-HARVEST FLOWER PACKAGED THIS MONTH'
    when pm.own_flower_lb >= c.contract_lb then 'MET'
    else 'BELOW THE CONTRACTED FLOOR'
  end                                                as contract_status,

  'One package, one bucket, first match wins: WIP_Production -> unclassified; Nature''s Biomass -> excluded; '
  || 'Fresh Frozen -> ff; Shake/Trim or Bulk shake or name ending Trim -> trim_shake; name ending Flower, '
  || 'Bulk Flower or Buds/Bud -> flower; else unclassified. Only harvest-sourced packages are counted '
  || '(SourceHarvestNames present, SourcePackageLabels null). contract_lb is compared ONLY to own-harvest '
  || 'flower - third-party Bulk Flower is not 380, and ff, trim, unclassified, waste and current weight never '
  || 'count towards it. Columns ending _harvest_month are dated by the month the harvest FINISHED; those '
  || 'ending _packaged_month by the month the package was PACKAGED. Those are different months for the same '
  || 'material, so nothing here is summed across them and there is deliberately no total.'::text
                                                     as how_phases_are_counted
from months m
left join hv    h  on h.month_date  = m.month_date
left join pk_m  pm on pm.month_date = m.month_date
left join contract c on true
order by m.month_date desc;

comment on view public.v_harvest_phase_split is
'Seed-to-sale harvest phases by month, current month plus trailing twelve, to CEO rules locked 29 Aug 2026. READ-ONLY. Harvest-level weights come from metrc_harvests ONLY (wet, waste, TotalPackagedWeight, CurrentWeight, TotalRestoredWeight), UOM-normalised, dated by the month the harvest FINISHED; identity_break is PRINTED, never repaired, when wet does not equal waste plus packaged plus current. The packaged split is secondary and covers harvest-sourced packages only (SourceHarvestNames present, SourcePackageLabels null), one package to exactly one bucket by the CEO order. contract_lb is compared ONLY to own-harvest flower: third-party Bulk Flower is not 380, and fresh frozen, trim, unclassified, waste, current weight and restored never count towards it. Biomass and water are NULL with evidence - Nature''s Biomass is a supplier name, excluded rather than counted, and Metrc records no moisture field. A NULL unit of measure yields NULL pounds, never 0. NOTE: this compares the contract against a DIFFERENT basis from v_harvest_contract_vs_metrc.actual_dried_lb, which is live; both are kept so the difference is visible before the contract is moved onto this basis.';
