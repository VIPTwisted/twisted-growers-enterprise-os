-- GROK-WHY: Owner 8 Sep 2026: every Metrc report they share is a cloned OS report. When the user hits Run, pull from Metrc/Apex API where an API exists. Flowering / Veg / Plantings cloned from metrc_plants / metrc_plant_batches. Grid reports with no API stay on vault/rpt tables. No Metrc write. No ledger rewrite. No GRANT to anon. Nav declares module.

create or replace view public.v_rpt_plants_flowering as
select tag, license as licence, strain, phase, room, planted_on, synced_at, source_state, report_as_of
from public.metrc_plants
where phase ~* 'flower';

create or replace view public.v_rpt_plants_vegetative as
select tag, license as licence, strain, phase, room, planted_on, synced_at, source_state, report_as_of
from public.metrc_plants
where phase ~* 'veg';

create or replace view public.v_rpt_plantings as
select name as plant_batch, license as licence, strain, count as plants, batch_type, planted_on, synced_at, source_state
from public.metrc_plant_batches;

comment on view public.v_rpt_plants_flowering is
  'Clone of Metrc Plants → Flowering, from the API mirror. Run = metrc-sync then this view. Not the grid export. CERTIFIED only on dual MATCH to a vaulted Flowering grid.';
comment on view public.v_rpt_plants_vegetative is
  'Clone of Metrc Plants → Vegetative, from the API mirror. Run = metrc-sync.';
comment on view public.v_rpt_plantings is
  'Clone of Metrc Plants → Plantings, from the API plant-batch mirror. A batch row is not one plant.';

grant select on public.v_rpt_plants_flowering to authenticated;
grant select on public.v_rpt_plants_vegetative to authenticated;
grant select on public.v_rpt_plantings to authenticated;

insert into public.nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled, page_kind, surface, module)
select 'Metrc', 6, 'Metrc Reports', 'Metrc report — Plants Flowering (live pull)', 20, 'flower',
       'rpt-plants-flowering', 'v_rpt_plants_flowering',
       'Clone of Metrc Plants → Flowering. Run pulls the Metrc plants API. Dual MATCH against a vaulted Flowering grid is a later stamp.',
       true, false, true, 'report', 'side', 'metrc'
where not exists (select 1 from public.nav_registry where view_key = 'rpt-plants-flowering');

insert into public.nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled, page_kind, surface, module)
select 'Metrc', 6, 'Metrc Reports', 'Metrc report — Plants Vegetative (live pull)', 21, 'leaf',
       'rpt-plants-vegetative', 'v_rpt_plants_vegetative',
       'Clone of Metrc Plants → Vegetative. Run pulls the Metrc plants API.',
       true, false, true, 'report', 'side', 'metrc'
where not exists (select 1 from public.nav_registry where view_key = 'rpt-plants-vegetative');

insert into public.nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled, page_kind, surface, module)
select 'Metrc', 6, 'Metrc Reports', 'Metrc report — Plantings (live pull)', 22, 'sprout',
       'rpt-plantings', 'v_rpt_plantings',
       'Clone of Metrc Plants → Plantings. Run pulls plant batches from the Metrc API. A batch is not one plant.',
       true, false, true, 'report', 'side', 'metrc'
where not exists (select 1 from public.nav_registry where view_key = 'rpt-plantings');

insert into public.nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled, page_kind, surface, module)
select 'Metrc', 6, 'Vault', 'Report Center — run every cloned report', -9, 'play',
       'report_center', 'v_report_vault_board',
       'Every cloned Metrc/Apex report. Run pulls from Metrc or Apex when an API exists. Grid-only reports read the vault.',
       true, false, true, 'application', 'side', 'metrc'
where not exists (select 1 from public.nav_registry where view_key = 'report_center');

update public.nav_registry
   set sync_enabled = true
 where category = 'Metrc'
   and page_kind = 'report'
   and enabled
   and sync_enabled is distinct from true
   and view_key like 'rpt-%';
