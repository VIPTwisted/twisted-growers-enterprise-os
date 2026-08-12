-- Owner, 10 Aug 2026: "in our OS you must have this broken down by each and every harvest
-- individually."
--
-- The first build covered 350 harvests - every CLOSED one, from the Harvests-Inactive export.
-- Metrc holds 380. The 30 absent are all still OPEN and none of them is a closed harvest gone
-- missing, so nothing was being hidden - but "each and every" means all 380, and an open
-- harvest that simply does not appear is indistinguishable from one that was lost.
--
-- Open harvests come from the API mirror. Their weight is NOT water: it is material still on
-- the harvest, drying. The moisture figure does not exist for them yet and the view says so
-- rather than showing a zero that would read as "no water lost" (rule A3).
--
-- Columns are APPENDED only, never reordered or dropped (rule E1).

create or replace view v_harvest_water_and_yield as
-- ---------------------------------------------------------------- closed: measured
select
  m.harvest_batch                       as harvest,
  m.strain,
  m.room,
  m.finished_on,
  m.licence,
  m.plants,
  round(m.wet_lb::numeric, 1)           as wet_in_lb,
  round(m.waste_lb::numeric, 1)         as waste_lb,
  round(m.moisture_loss_lb::numeric, 1) as water_lost_lb,
  round(m.packaged_lb::numeric, 1)      as dry_yield_lb,
  round(m.moisture_pct::numeric, 1)     as water_pct,
  round((m.wet_lb - coalesce(m.waste_lb,0) - coalesce(m.moisture_loss_lb,0)
         - coalesce(m.packaged_lb,0))::numeric, 2)                  as balance_lb,
  case when abs(m.wet_lb - coalesce(m.waste_lb,0) - coalesce(m.moisture_loss_lb,0)
                - coalesce(m.packaged_lb,0)) <= 0.5
       then 'balances' else 'DOES NOT BALANCE' end                  as balance_check,
  case when coalesce(m.plants,0) > 0
       then round((m.packaged_lb * 453.592 / m.plants)::numeric, 1) end as dry_g_per_plant,
  case
    when coalesce(m.plants,0) = 0                   then 'no plant count - yield cannot be judged'
    when m.packaged_lb * 453.592 / m.plants >= 70.6 then 'at or above the 70.6 g target'
    when m.packaged_lb * 453.592 / m.plants >= 50   then 'below target but plausible'
    when m.packaged_lb * 453.592 / m.plants >= 25   then 'HALF TARGET OR WORSE'
    else                                                 'UNDER 25 g PER PLANT - unaccounted'
  end                                                               as yield_verdict,
  case when coalesce(m.moisture_loss_lb,0) = 0
       then 'fresh frozen - packaged wet, never dried, so zero water is CORRECT'
       else 'dried' end                                             as drying_kind,
  m.harvest_batch || ': ' || round(m.wet_lb::numeric,1) || ' lb in wet. '
    || round(coalesce(m.waste_lb,0)::numeric,1) || ' lb waste, '
    || round(coalesce(m.moisture_loss_lb,0)::numeric,1) || ' lb water evaporated, '
    || round(coalesce(m.packaged_lb,0)::numeric,1) || ' lb packaged dry'
    || case when coalesce(m.plants,0) > 0
            then ' from ' || m.plants || ' plants = '
                 || round((m.packaged_lb*453.592/m.plants)::numeric,1) || ' g per plant'
            else '' end || '. '
    || case when abs(m.wet_lb - coalesce(m.waste_lb,0) - coalesce(m.moisture_loss_lb,0)
                     - coalesce(m.packaged_lb,0)) <= 0.5
            then 'Every pound accounted for.'
            else 'WARNING: ' || round(abs(m.wet_lb - coalesce(m.waste_lb,0)
                 - coalesce(m.moisture_loss_lb,0) - coalesce(m.packaged_lb,0))::numeric,1)
                 || ' lb unaccounted.' end                           as in_plain_english,
  -- appended 10 Aug 2026
  'CLOSED'::text                                                     as harvest_state,
  null::numeric                                                      as still_on_harvest_lb,
  'Metrc Harvests-Inactive report - the only source of moisture loss'::text as measured_from

from metrc_rpt_harvest_moisture m

union all
-- ---------------------------------------------------------------- open: still drying
select
  h.name,
  nullif(h.raw->>'SourceStrainNames',''),
  h.raw->>'DryingLocationName',
  null::date,
  h.license,
  (h.raw->>'PlantCount')::numeric,
  round(((h.raw->>'TotalWetWeight')::numeric/453.592)::numeric, 1),
  round(((h.raw->>'TotalWasteWeight')::numeric/453.592)::numeric, 1),
  null::numeric,                                   -- water: NOT KNOWN YET, never zero
  round(((h.raw->>'TotalPackagedWeight')::numeric/453.592)::numeric, 1),
  null::numeric,
  null::numeric,
  'still open - cannot balance until the harvest is finished',
  case when coalesce((h.raw->>'PlantCount')::numeric,0) > 0
       then round(((h.raw->>'TotalPackagedWeight')::numeric/(h.raw->>'PlantCount')::numeric)::numeric,1) end,
  'still open - yield is not final',
  'still drying - moisture is only recorded when the harvest is finished',
  h.name || ': ' || round(((h.raw->>'TotalWetWeight')::numeric/453.592)::numeric,1)
    || ' lb in wet, harvest STILL OPEN. '
    || round(((h.raw->>'TotalWasteWeight')::numeric/453.592)::numeric,1) || ' lb waste and '
    || round(((h.raw->>'TotalPackagedWeight')::numeric/453.592)::numeric,1)
    || ' lb packaged so far, with '
    || round(((h.raw->>'CurrentWeight')::numeric/453.592)::numeric,1)
    || ' lb still on the harvest. That remaining weight is material still drying, NOT a '
    || 'measured water loss - Metrc only records moisture when the harvest is finished, so '
    || 'the water column is deliberately blank rather than zero.',
  'OPEN',
  round(((h.raw->>'CurrentWeight')::numeric/453.592)::numeric, 1),
  'Metrc API - the moisture report only covers finished harvests'
from metrc_harvests h
where not exists (select 1 from metrc_rpt_harvest_moisture m2 where m2.harvest_batch = h.name);

comment on view v_harvest_water_and_yield is
  'EVERY harvest individually - all 380. Closed harvests (350) carry measured moisture from the '
  'Harvests-Inactive export and balance to zero. Open harvests (30) come from the API, where '
  'moisture does not exist yet: the water column is BLANK, not zero, and their remaining weight '
  'is shown separately as still_on_harvest_lb because it is drying material, not evaporation. '
  'Pre-harvest plant destruction is keyed to plant batch, not harvest - see v_plant_loss_by_batch.';;
