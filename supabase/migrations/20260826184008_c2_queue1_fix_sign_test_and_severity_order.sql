-- Two corrections found in verification:
--
-- 1. The sign test was using harvest_mass_balance_tolerance_lb (0.5 lb), which
--    exists to absorb ledger rounding. Applied to a sign flip it suppressed both
--    genuinely impossible harvests, because each is a small harvest: 0.309 lb wet
--    with 0.201 packaged and 0.201 wasted, and 4.828 lb wet with 4.004 packaged
--    and 0.950 wasted. A NEGATIVE residual is categorically impossible at any
--    magnitude, so the test now runs on the native gram integers Metrc returns,
--    before any unit conversion, where there is no float to absorb.
--
-- 2. The severity ladder ranked 30 closed harvests holding 20.1 lb between them
--    ABOVE 8 open harvests holding 1,794.5 lb. The issue_queue archetype requires
--    oldest and most costly first. Open-and-stalled now outranks closed-and-empty.
create or replace view public.v_xq_harvest_moisture
with (security_invoker = true) as
with rule as (
  select f_rule('expected_moisture_pct_min')          as owner_min_pct,
         f_rule('expected_moisture_pct_max')          as owner_max_pct,
         f_rule('harvest_residual_outlier_min_pct')   as outlier_min_pct,
         f_rule('harvest_residual_outlier_max_pct')   as outlier_max_pct,
         f_rule('dry_window_max_days')                as dry_window_days,
         f_rule('harvest_mass_balance_tolerance_lb')  as tol_lb
),
h as (
  select
    mh.name                                                          as harvest_name,
    mh.license                                                       as licence,
    mh.source_state                                                  as metrc_list,
    nullif(mh.raw->>'SourceStrainNames','')                          as strain,
    nullif(mh.raw->>'DryingLocationName','')                         as drying_room,
    mh.harvest_start                                                 as harvest_started,
    nullif(mh.raw->>'FinishedDate','')::date                         as harvest_closed,
    (mh.raw->>'PlantCount')::numeric                                 as plants,
    (mh.raw->>'IsOnHold')::boolean                                   as on_hold,
    mh.raw->>'UnitOfWeightName'                                      as metrc_uom,
    -- native units, exact numeric, used for the sign tests
    (mh.raw->>'TotalWetWeight')::numeric                             as wet_native,
    (mh.raw->>'CurrentWeight')::numeric                              as residual_native,
    f_to_pounds((mh.raw->>'TotalWetWeight')::numeric,       mh.raw->>'UnitOfWeightName') as wet_lb,
    f_to_pounds((mh.raw->>'TotalWasteWeight')::numeric,     mh.raw->>'UnitOfWeightName') as waste_lb,
    f_to_pounds((mh.raw->>'TotalPackagedWeight')::numeric,  mh.raw->>'UnitOfWeightName') as packaged_lb,
    f_to_pounds((mh.raw->>'TotalRestoredWeight')::numeric,  mh.raw->>'UnitOfWeightName') as restored_lb,
    f_to_pounds((mh.raw->>'CurrentWeight')::numeric,        mh.raw->>'UnitOfWeightName') as residual_lb,
    f_harvest_weight_basis(mh.name, mh.raw->>'DryingLocationName',
                           (mh.raw->>'CurrentWeight')::numeric)      as weight_basis,
    mh.synced_at                                                     as metrc_synced_at
  from metrc_harvests mh
),
j as (
  select h.*,
         r.owner_min_pct, r.owner_max_pct, r.outlier_min_pct, r.outlier_max_pct,
         r.dry_window_days, r.tol_lb,
         round(100.0 * h.residual_lb / nullif(h.wet_lb,0), 1)         as residual_pct_of_wet,
         m.moisture_pct                                               as report_moisture_pct,
         m.moisture_loss_lb                                           as report_residual_lb,
         m.as_of_date                                                 as report_as_of,
         (current_date - h.harvest_started)                           as days_open
  from h
  cross join rule r
  left join metrc_rpt_harvest_moisture m on m.harvest_batch = h.harvest_name
)
select
  'Harvest moisture / residual'::text as queue,
  harvest_name, licence, strain, drying_room, plants,
  harvest_started, harvest_closed, days_open, on_hold,
  case when harvest_closed is null then 'OPEN in Metrc' else 'CLOSED in Metrc' end as harvest_state,
  case weight_basis when 'wet' then 'Fresh frozen (wet basis)'
                    when 'dry' then 'Dried flower'
                    else 'Unknown basis' end as stream,
  round(wet_lb,1)      as wet_lb,
  round(packaged_lb,1) as packaged_lb,
  round(waste_lb,1)    as waste_lb,
  round(residual_lb,1) as metrc_current_weight_lb,
  residual_pct_of_wet,
  case
    when residual_native < 0                                               then '1 IMPOSSIBLE'
    when wet_native > 0 and residual_native > wet_native                   then '1 IMPOSSIBLE'
    when harvest_closed is null
     and packaged_lb <= tol_lb
     and (current_date - harvest_started) > dry_window_days                then '2 OPEN, PAST THE DRY WINDOW, NOTHING TAKEN OFF'
    when harvest_closed is not null
     and packaged_lb <= tol_lb and waste_lb <= tol_lb                      then '3 CLOSED WITH NOTHING TAKEN OFF'
    when weight_basis = 'dry' and harvest_closed is not null
     and (residual_pct_of_wet < outlier_min_pct
       or residual_pct_of_wet > outlier_max_pct)                           then '4 OUTLIER AGAINST OUR OWN HARVESTS'
    when weight_basis = 'dry' and harvest_closed is not null
     and (residual_pct_of_wet < owner_min_pct
       or residual_pct_of_wet > owner_max_pct)                             then '5 OUTSIDE THE OWNER-SET EXPECTED BAND'
  end as severity,
  case
    when residual_native < 0 then
      'Metrc holds a NEGATIVE residual of ' || round(residual_lb,3) || ' lb on a harvest of ' || round(wet_lb,3) || ' lb wet. Packaged plus waste exceeds the wet weight that was entered. One of the three numbers is wrong in Metrc.'
    when wet_native > 0 and residual_native > wet_native then
      'Metrc holds a residual of ' || round(residual_lb,1) || ' lb against a wet weight of ' || round(wet_lb,1) || ' lb. A harvest cannot hold more than it started with.'
    when harvest_closed is null and packaged_lb <= tol_lb and (current_date - harvest_started) > dry_window_days then
      'Cut ' || harvest_started || ', ' || (current_date - harvest_started) || ' days ago, against a ' || dry_window_days || ' day dry window, and not one package has come off it. Metrc still shows the full ' || round(residual_lb,1) || ' lb sitting on the harvest as wet weight.'
    when harvest_closed is not null and packaged_lb <= tol_lb and waste_lb <= tol_lb then
      'Closed in Metrc on ' || harvest_closed || ' with ' || round(wet_lb,2) || ' lb wet entered and nothing ever packaged and nothing ever wasted. The whole ' || round(wet_lb,2) || ' lb was written off as residual at finish. Small harvest - check the weight before treating it as a loss.'
    when weight_basis = 'dry' and harvest_closed is not null and residual_pct_of_wet < outlier_min_pct then
      'Residual is ' || residual_pct_of_wet || '% of wet, below the ' || outlier_min_pct || '% bottom of our own measured spread. More mass came off as packages than the water loss allows, so the packaged weight is carrying water.'
    when weight_basis = 'dry' and harvest_closed is not null and residual_pct_of_wet > outlier_max_pct then
      'Residual is ' || residual_pct_of_wet || '% of wet, above the ' || outlier_max_pct || '% top of our own measured spread. ' || round(residual_lb,1) || ' lb was written off at finish, more than drying has ever taken from a harvest here.'
    when weight_basis = 'dry' and harvest_closed is not null then
      'Residual is ' || residual_pct_of_wet || '% of wet, outside the owner-set expected band of ' || owner_min_pct || '% to ' || owner_max_pct || '% but inside our own measured spread. Informational, not a defect on its own.'
  end as what_is_wrong,
  case
    when residual_native < 0 or (wet_native > 0 and residual_native > wet_native) then
      'Open this harvest in Metrc and check the wet weight, the waste entries and the package weights against the paperwork. This platform cannot correct Metrc; the fix is a Metrc adjustment made by a licensed user.'
    when harvest_closed is null then
      'Walk the drying room. Either the material is there and packages are owed, or it has moved and Metrc was never told.'
    else
      'Pull the harvest paperwork for this batch and compare the wet weight and the package weights to what was written on the floor. Record what you find; do not adjust Metrc from this screen.'
  end as what_to_do,
  'metrc_harvests (Metrc API mirror)'::text as metrc_source,
  metrc_synced_at::date                     as metrc_as_of,
  metrc_uom                                 as metrc_native_unit,
  metrc_list                                as metrc_list_it_came_from,
  case
    when report_moisture_pct is null then
      'NOT CORROBORATED: this harvest is not in the Metrc Harvests report import, which is as of 4 Aug 2026 and holds 350 of the 385 harvests the API returns.'
    when abs(coalesce(report_moisture_pct,0) - coalesce(residual_pct_of_wet,0)) <= 0.1 then
      'CORROBORATED: the Metrc Harvests report (as of ' || report_as_of || ') gives the same residual share, ' || report_moisture_pct || '%.'
    else
      'DISAGREES: the Metrc Harvests report (as of ' || report_as_of || ') gives ' || report_moisture_pct || '% against the API''s ' || residual_pct_of_wet || '%. Two Metrc sources do not match.'
  end as second_source_check,
  'expected_moisture_pct_min / expected_moisture_pct_max / harvest_residual_outlier_min_pct / harvest_residual_outlier_max_pct / dry_window_max_days'::text as rule_used,
  owner_min_pct, owner_max_pct, outlier_min_pct, outlier_max_pct, dry_window_days,
  'The residual is DERIVED (wet minus waste minus packaged, plus restored). It is not a water measurement. Fresh-frozen harvests are excluded from the band tests because they are packaged wet and correctly show no moisture loss. The two sign tests run on the native gram values Metrc returns, not on the converted pounds.'::text as measurement_caveat
from j
where
     residual_native < 0
  or (wet_native > 0 and residual_native > wet_native)
  or (harvest_closed is null and packaged_lb <= tol_lb and (current_date - harvest_started) > dry_window_days)
  or (harvest_closed is not null and packaged_lb <= tol_lb and waste_lb <= tol_lb)
  or (weight_basis = 'dry' and harvest_closed is not null
      and (residual_pct_of_wet < owner_min_pct or residual_pct_of_wet > owner_max_pct))
order by severity, abs(coalesce(residual_lb,0)) desc;

comment on view public.v_xq_harvest_moisture is
'TICKET C2 QUEUE 1. Harvests whose Metrc residual (CurrentWeight) does not sit where our own measured drying puts it. Source metrc_harvests, corroborated against metrc_rpt_harvest_moisture. Thresholds are conversion_factors rows read through f_rule. Sign tests run on native grams. Reports only - never corrects Metrc, never proposes a moisture band fix.';;
