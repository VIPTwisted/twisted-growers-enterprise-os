-- The lost-and-destroyed half of the owner's question, kept SEPARATE and honestly labelled.
--
-- Metrc keys plant waste and plants-destroyed to the PLANT BATCH, never to a harvest. There
-- is no field joining either to a harvest batch. Attributing them per harvest would require
-- inventing a link, which rule A1 forbids. So they are reported by batch, and the fact that
-- they cannot be tied to a harvest is stated on the face of the view (rule A3).

create or replace view v_plant_loss_by_batch as
select
  'destroyed plant'::text                       as kind,
  d.plant_batch,
  d.strain,
  d.location,
  d.phase                                       as phase_when_destroyed,
  d.destroyed_on                                as happened_on,
  count(*)::numeric                             as plants,
  null::numeric                                 as weight_qty,
  null::text                                    as uom,
  coalesce(max(d.destroyed_note), 'no reason recorded in Metrc') as reason,
  d.licence,
  'Metrc records this against the PLANT BATCH, not a harvest. It cannot be attributed to a '
  || 'harvest without inventing a link.'::text   as attribution_note
from metrc_rpt_plants_destroyed d
where d.destroyed_on is not null
group by d.plant_batch, d.strain, d.location, d.phase, d.destroyed_on, d.licence

union all

select
  'plant waste',
  w.plant_batch,
  null,
  null,
  null,
  w.waste_date,
  w.total_plants::numeric,
  w.waste_qty,
  w.uom,
  coalesce(w.reason, 'no reason recorded in Metrc')
    || case when w.waste_method is not null then ' (' || w.waste_method || ')' else '' end,
  w.licence,
  'Metrc records this against the PLANT BATCH, not a harvest. Harvest-stage waste is separate '
  || 'and appears as waste_lb in v_harvest_water_and_yield.'
from metrc_rpt_plant_waste w;

comment on view v_plant_loss_by_batch is
  'Plants destroyed and plant waste, BY PLANT BATCH. Deliberately not joined to harvests: '
  'Metrc provides no harvest key on either report, and a per-harvest figure would be invented. '
  'Harvest-stage waste is a different thing and lives in v_harvest_water_and_yield.waste_lb.';;
