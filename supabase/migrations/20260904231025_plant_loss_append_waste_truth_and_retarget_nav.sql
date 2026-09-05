-- Applied prod 20260904231025. Ledger not rewritten.
-- weight_qty stays the stored mixed column. waste_g/waste_lb appended.
-- rpt-plant-waste now reads v_waste_qty_truth. Totals refused (empty measures).

create or replace view public.v_plant_loss_by_batch as
select
  'destroyed plant'::text as kind,
  d.plant_batch,
  d.strain,
  d.location,
  d.phase as phase_when_destroyed,
  d.destroyed_on as happened_on,
  count(*)::numeric as plants,
  null::numeric as weight_qty,
  null::text as uom,
  coalesce(max(d.destroyed_note), 'no reason recorded in Metrc') as reason,
  d.licence,
  'Metrc records this against the PLANT BATCH, not a harvest. It cannot be attributed to a harvest without inventing a link.'::text as attribution_note,
  null::text as qty_class,
  null::numeric as waste_g,
  null::numeric as waste_lb
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
  'Metrc records this against the PLANT BATCH, not a harvest. Harvest-stage waste is separate and appears as waste_lb in v_harvest_water_and_yield. weight_qty is the stored mixed column — do not total it. Use waste_g / waste_lb.',
  t.qty_class,
  t.waste_g,
  t.waste_lb
from metrc_rpt_plant_waste w
left join v_waste_qty_truth t on t.waste_number = w.waste_number;

alter view public.v_plant_loss_by_batch set (security_invoker = true);

comment on view public.v_plant_loss_by_batch is
  'Plants destroyed and plant waste, BY PLANT BATCH. weight_qty on plant-waste rows is the mixed stored column (pounds labelled as g). Do not total it. waste_g and waste_lb are from v_waste_qty_truth. Ledger not rewritten.';

update public.nav_registry
   set table_ref = 'v_waste_qty_truth',
       description = 'Plant waste events. Keys certified. Values classified. Do not total qty_stored_do_not_total. Use waste_g or waste_lb. Converted totals are UNCERTIFIED until dual MATCH.'
 where view_key = 'rpt-plant-waste';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  dimensions, measures, description, owner_note, enabled,
  row_grain, grain_keys, measure_contracts
)
select
  'metrc.waste_qty_truth',
  'Plant waste — grams and pounds, not mixed',
  'Metrc',
  'v_waste_qty_truth',
  'waste_date',
  array['licence','waste_method','qty_class','material_mixed'],
  array[]::text[],
  'No approved totals. qty_stored_do_not_total is mixed uom. waste_g/waste_lb exist as classified columns but are UNCERTIFIED until dual MATCH. Ledger not rewritten.',
  'Owner 4 Sep 2026: ALL NUMBERS MUST BE CERTIFIED. Empty measures is deliberate — totals refused.',
  true,
  'one row per waste_number',
  array['waste_number'],
  '{}'::jsonb
where not exists (select 1 from public.report_registry where report_key = 'metrc.waste_qty_truth');
