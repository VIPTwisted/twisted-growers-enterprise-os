-- Applied prod 20260905115848.
-- v_metrc_package_inventory grouped by item+location+lab and took min(uom),
-- summing quantity across g/ea/lb in 65 groups. default_range=today filtered
-- oldest_date (packaged_on) so as-of-now on-hand looked empty.

create or replace view public.v_metrc_package_inventory as
select license,
       coalesce(item_name, '—') as item,
       coalesce(location, '—') as location,
       count(*) as packages,
       round(sum(quantity), 2) as total_qty,
       coalesce(uom, '—') as uom,
       coalesce(lab_testing_state, '—') as lab_state,
       count(*) filter (where finished) as finished_pkgs,
       min(packaged_on) as oldest,
       max(packaged_on) as newest,
       min(packaged_on) as oldest_date
  from metrc_packages
 group by license, item_name, location, lab_testing_state, uom;

update public.nav_registry
   set default_range = 'all',
       date_policy = 'auto',
       range_kind = 'snapshot',
       description = 'Live Metrc packages, grouped by item+location+lab+uom. total_qty is per UOM — do not total across rows. As-of-now, not packages created today. Not the 8/6 Packages Inventory freeze.'
 where view_key = 'metrc_rpt_packages';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.live_package_inventory',
  'Live package inventory — UOM split, as-of now',
  'Metrc',
  'v_metrc_package_inventory',
  null,
  '{}'::text[],
  '{}'::jsonb,
  array['license','item','location','lab_state','uom'],
  'one row per license + item + location + lab_state + uom',
  true,
  'total_qty must not be summed across uom. This is live on-hand, not the 8/6 freeze.',
  array['license','uom','lab_state','location']
)
on conflict (report_key) do update set
  fact_view = excluded.fact_view,
  date_column = excluded.date_column,
  measures = excluded.measures,
  grain_keys = excluded.grain_keys,
  row_grain = excluded.row_grain,
  description = excluded.description,
  dimensions = excluded.dimensions,
  updated_at = now();
