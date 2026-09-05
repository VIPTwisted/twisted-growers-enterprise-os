-- Applied prod 20260905015035. Ledger destroyed_on NOT rewritten.
-- DEST-MC: date lives in source_row "Destroyed Date" as Excel serial.

create or replace view public.v_plants_destroyed_truth as
select
  d.*,
  case
    when nullif(btrim(d.source_row->>'Destroyed Date'), '') is not null
      then date '1899-12-30' + (nullif(btrim(d.source_row->>'Destroyed Date'), '')::numeric)::int
    else null
  end as destroyed_date_from_source,
  case
    when d.destroyed_on is not null then 'ledger destroyed_on'
    when nullif(btrim(d.source_row->>'Destroyed Date'), '') is not null
      then 'source_row Destroyed Date (Excel serial). Ledger destroyed_on is NULL. Do not rewrite the ledger.'
    else 'no destroyed date on ledger or in source_row'
  end as date_provenance
from public.metrc_rpt_plants_destroyed d;

alter view public.v_plants_destroyed_truth set (security_invoker = true);

comment on view public.v_plants_destroyed_truth is
  'metrc_rpt_plants_destroyed plus destroyed_date_from_source parsed from source_row.Destroyed Date. Ledger destroyed_on is not rewritten.';

create or replace view public.v_plant_loss_by_batch as
select
  'destroyed plant'::text as kind,
  d.plant_batch,
  d.strain,
  d.location,
  d.phase as phase_when_destroyed,
  d.destroyed_date_from_source as happened_on,
  count(*)::numeric as plants,
  null::numeric as weight_qty,
  null::text as uom,
  coalesce(max(d.destroyed_note), 'no reason recorded in Metrc') as reason,
  d.licence,
  'Metrc records this against the PLANT BATCH, not a harvest. happened_on is source_row Destroyed Date, not ledger destroyed_on (NULL on every row). Do not invent a harvest link.'::text as attribution_note,
  null::text as qty_class,
  null::numeric as waste_g,
  null::numeric as waste_lb
from public.v_plants_destroyed_truth d
where d.destroyed_date_from_source is not null
group by d.plant_batch, d.strain, d.location, d.phase, d.destroyed_date_from_source, d.licence
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
from public.metrc_rpt_plant_waste w
left join public.v_waste_qty_truth t on t.waste_number = w.waste_number;

alter view public.v_plant_loss_by_batch set (security_invoker = true);
