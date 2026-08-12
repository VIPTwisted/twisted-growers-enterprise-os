-- Owner, 10 Aug 2026: "do you see dry yield totals per harvest less water" / "and lost or
-- destroyed harvest" / "and waste" / "all that must be properly documented in OS".
--
-- Named apart from v_harvest_mass_balance, which already exists, holds 0 rows, and is a
-- MANUAL grading sheet (grade A/B/C, entered_by, verified_by). This one is the MEASURED
-- position from Metrc and is deliberately not merged with it.
--
-- SOURCE: metrc_rpt_harvest_moisture, the Harvests-Inactive export. It is the ONLY source of
-- moisture loss. The Metrc API's harvest object has NO moisture field - only CurrentWeight,
-- a residual of wet minus waste minus packaged. Reading that residual and calling it
-- "never entered" produced a false finding on 10 Aug 2026, withdrawn the same day. The
-- moisture IS recorded, and this view proves it: 350 harvests, balance 0.00 lb.

create or replace view v_harvest_water_and_yield as
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
       then 'balances'
       else 'DOES NOT BALANCE' end                                  as balance_check,
  case when coalesce(m.plants,0) > 0
       then round((m.packaged_lb * 453.592 / m.plants)::numeric, 1) end as dry_g_per_plant,
  case
    when coalesce(m.plants,0) = 0                          then 'no plant count - yield cannot be judged'
    when m.packaged_lb * 453.592 / m.plants >= 70.6        then 'at or above the 70.6 g target'
    when m.packaged_lb * 453.592 / m.plants >= 50          then 'below target but plausible'
    when m.packaged_lb * 453.592 / m.plants >= 25          then 'HALF TARGET OR WORSE'
    else                                                        'UNDER 25 g PER PLANT - unaccounted'
  end                                                              as yield_verdict,
  case when coalesce(m.moisture_loss_lb,0) = 0
       then 'fresh frozen - packaged wet, never dried, so zero water is CORRECT'
       else 'dried' end                                            as drying_kind,
  m.harvest_batch || ': ' || round(m.wet_lb::numeric,1) || ' lb in wet. '
    || round(coalesce(m.waste_lb,0)::numeric,1) || ' lb waste, '
    || round(coalesce(m.moisture_loss_lb,0)::numeric,1) || ' lb water evaporated, '
    || round(coalesce(m.packaged_lb,0)::numeric,1) || ' lb packaged dry'
    || case when coalesce(m.plants,0) > 0
            then ' from ' || m.plants || ' plants = '
                 || round((m.packaged_lb*453.592/m.plants)::numeric,1) || ' g per plant'
            else '' end
    || '. '
    || case when abs(m.wet_lb - coalesce(m.waste_lb,0) - coalesce(m.moisture_loss_lb,0)
                     - coalesce(m.packaged_lb,0)) <= 0.5
            then 'Every pound accounted for.'
            else 'WARNING: ' || round(abs(m.wet_lb - coalesce(m.waste_lb,0)
                 - coalesce(m.moisture_loss_lb,0) - coalesce(m.packaged_lb,0))::numeric,1)
                 || ' lb unaccounted.' end                          as in_plain_english
from metrc_rpt_harvest_moisture m;

comment on view v_harvest_water_and_yield is
  'Per harvest: wet in, waste, WATER evaporated, dry yield out, and whether it balances. '
  'Source is the Harvests-Inactive export - the only source of moisture loss, since the Metrc '
  'API carries none. Fresh frozen correctly shows zero water. PRE-HARVEST plant destruction is '
  'NOT here: Metrc keys plant waste and plants-destroyed to the PLANT BATCH, not the harvest, '
  'so it cannot honestly be attributed per harvest - see v_plant_loss_by_batch.';;
