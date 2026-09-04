-- Applied prod 20260904220142. Keys certified, values mixed. Do not total waste_qty.
create or replace view public.v_waste_qty_truth as
select
  w.waste_number,
  w.licence,
  w.waste_date,
  w.waste_method,
  w.material_mixed,
  w.waste_qty as qty_stored_do_not_total,
  w.uom as uom_stored,
  (w.source_row->>'Waste')::numeric as source_g,
  case
    when w.source_row->>'Waste' is null then 'no_source'
    when abs(w.waste_qty - (w.source_row->>'Waste')::numeric) < 0.01 then 'grams_unconverted'
    when abs(w.waste_qty - (w.source_row->>'Waste')::numeric / 453.59237) < 0.01 then 'pounds_labelled_as_g'
    else 'unclassified'
  end as qty_class,
  case
    when abs(w.waste_qty - (w.source_row->>'Waste')::numeric / 453.59237) < 0.01
      then w.waste_qty * 453.59237
    else w.waste_qty
  end as waste_g,
  case
    when abs(w.waste_qty - (w.source_row->>'Waste')::numeric / 453.59237) < 0.01
      then w.waste_qty
    else w.waste_qty / 453.59237
  end as waste_lb
from public.metrc_rpt_plant_waste w;

alter view public.v_waste_qty_truth set (security_invoker = true);

comment on view public.v_waste_qty_truth is
'KEYS on metrc_rpt_plant_waste are certified (4,407). VALUES are not. waste_qty mixes pounds and grams under uom=g: most rows are source_row.Waste / 453.59237 with the label still grams. Do not total qty_stored_do_not_total. Use waste_g or waste_lb. Ledger rows are not rewritten.';

grant select on public.v_waste_qty_truth to authenticated;
revoke all on public.v_waste_qty_truth from anon, public;
