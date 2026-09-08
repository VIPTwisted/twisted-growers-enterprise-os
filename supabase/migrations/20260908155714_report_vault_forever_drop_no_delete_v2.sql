-- GROK-WHY: Owner 8 Sep 2026: stop taking Metrc reports in chat. Vault stores bytes forever. No ledger rewrite. No Metrc write. CERTIFIED still dual MATCH after parse. No GRANT to anon. Nav rows declare module.

create table if not exists public.report_vault (
  id uuid primary key default gen_random_uuid(),
  stored_at timestamptz not null default now(),
  original_name text not null,
  storage_path text not null,
  sha256 text not null,
  bytes bigint not null check (bytes >= 0),
  mime text,
  report_key text,
  licence text,
  period_stated text,
  as_of date,
  uploaded_by uuid,
  uploaded_email text,
  parse_status text not null default 'stored',
  parse_note text,
  never_delete boolean not null default true,
  source text not null default 'os-vault',
  need_key text
);

create unique index if not exists report_vault_path_uidx on public.report_vault (storage_path);
create index if not exists report_vault_sha_idx on public.report_vault (sha256);
create index if not exists report_vault_key_idx on public.report_vault (report_key, licence, stored_at desc);
create index if not exists report_vault_need_idx on public.report_vault (need_key, stored_at desc);

comment on table public.report_vault is
  'Immutable drop box for Metrc/Apex/grid files. Bytes live in storage bucket report-vault. Rows are never deleted. Parse into rpt tables is a later, separate act. CERTIFIED is not implied by landing here.';

create or replace function public.tg_report_vault_forbid_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'report_vault is forever. DELETE is forbidden. Owner 8 Sep 2026.';
end;
$$;

drop trigger if exists trg_report_vault_no_delete on public.report_vault;
create trigger trg_report_vault_no_delete
  before delete on public.report_vault
  for each row execute function public.tg_report_vault_forbid_delete();

alter table public.report_vault enable row level security;
drop policy if exists report_vault_select on public.report_vault;
create policy report_vault_select on public.report_vault for select to authenticated using (true);
drop policy if exists report_vault_insert on public.report_vault;
create policy report_vault_insert on public.report_vault for insert to authenticated with check (true);
revoke all on public.report_vault from public;
grant select, insert on public.report_vault to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('report-vault', 'report-vault', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = 104857600;

drop policy if exists report_vault_obj_select on storage.objects;
create policy report_vault_obj_select on storage.objects for select to authenticated using (bucket_id = 'report-vault');
drop policy if exists report_vault_obj_insert on storage.objects;
create policy report_vault_obj_insert on storage.objects for insert to authenticated with check (bucket_id = 'report-vault');

create table if not exists public.report_vault_need (
  need_key text primary key,
  title text not null,
  licences text[] not null,
  why text not null,
  how_to_export text not null,
  tick_columns text,
  cadence text not null,
  priority int not null,
  api_covers boolean not null default false
);
alter table public.report_vault_need enable row level security;
drop policy if exists report_vault_need_select on public.report_vault_need;
create policy report_vault_need_select on public.report_vault_need for select to authenticated using (true);
revoke all on public.report_vault_need from public;
grant select on public.report_vault_need to authenticated;

insert into public.report_vault_need (need_key, title, licences, why, how_to_export, tick_columns, cadence, priority, api_covers) values
('harvests_inactive', 'Plants — Harvests Inactive (moisture)', array['MC281714'], 'ONLY source of Moisture Loss. Wet-to-dry cannot certify without it.', 'Metrc → Plants → Harvests → Inactive → Export. Date range: day-one through today.', 'Moisture Loss, Waste, Packaged, Wet Weight, Finished Date, Harvest Name. Turn EVERY column on. Moisture Loss is hidden by default.', 'Now, then monthly', 1, false),
('packages_transferred', 'Packages — Transferred (with UoM)', array['MC281714','MP281909'], 'ONLY source of package-level wholesale price. API returns 401.', 'Metrc → Packages → Transferred. ONE FILE PER LICENCE.', 'Shipped UoM, Received UoM, Wholesale Price, Manifest Number, Destination. Tick every column.', 'Now, then monthly', 2, false),
('lab_results', 'Lab Results (all analytes)', array['MC281714','MP281909'], 'API is per-package and 401s on packages we do not own. Lab sync dead since 6 Aug.', 'Metrc → Reports → Lab Results. Both licences. Day-one through today.', 'Every analyte column. Tick all.', 'Now, then monthly', 3, false),
('inventory_point_in_time', 'Inventory Point in Time', array['MC281714','MP281909'], 'Certified-match watchdog compares OS row count to this grid. Need today as-of, not 29 Aug.', 'Metrc → Reports → Inventory Point in Time. Both licences. As-of = today.', 'All columns. This report has NO weight — that is expected.', 'Now (today as-of), then month-end', 4, false),
('plants_flowering', 'Plants — Flowering (current)', array['MC281714'], 'Independent count of F1-F4 vs two-size rooms (1140 / 1050). Last grid 17 Aug.', 'Metrc → Plants → Flowering → Export grid.', 'Tag, Strain, Location, Sublocation, Phase Date, Harvested.', 'Now, then weekly', 5, false),
('plants_vegetative', 'Plants — Vegetative', array['MC281714'], 'Tagged veg only. Completes the plant book with flowering.', 'Metrc → Plants → Vegetative → Export.', 'Same columns as Flowering.', 'Now, then weekly', 6, false),
('plantings_active', 'Plants — Plantings Active', array['MC281714'], 'NEVER PARSED. Clone/veg batches. A batch row is not one plant.', 'Metrc → Plants → Plantings → Active → Export.', 'Plant Batch, Strain, Location, Plants, Tracked, Packaged, Destroyed, Source Package, Source Plant, Batch Date.', 'Now, then weekly', 7, false),
('plantings_inactive', 'Plants — Plantings Inactive', array['MC281714'], 'NEVER PARSED. Best answer to where this plant came from.', 'Metrc → Plants → Plantings → Inactive → Export. Day-one through today.', 'Same as Active plus history.', 'Now, then monthly', 8, false),
('packages_lineage', 'Packages grid WITH Source Harvest + Source Package', array['MC281714','MP281909'], 'Default column set omits parents. 14,822 packages have no harvest parent.', 'Metrc → Packages → Active AND Inactive. Column selector: Source Harvest AND Source Package ON. Both licences.', 'Source Harvest, Source Package, Item, Quantity, Unit of Measure, Location.', 'Now, then on sync failure', 9, false),
('plants_waste', 'Plants — Waste', array['MC281714'], 'Waste method, reason, UoM. Do not sum mixed units. Feeds v_waste_qty_truth.', 'Metrc → Plants → Waste → Export. Day-one through today.', 'Waste, Unit Of Measure, Reason, Waste Date, Plant Batch. NO location column.', 'Now, then quarterly', 10, false),
('plants_destroyed', 'Plants Destroyed', array['MC281714'], 'destroyed_on is NOT in the export. Phase_date is the date. Do not rewrite destroyed_on.', 'Metrc → Reports → Plants Destroyed. Day-one through today.', 'All columns. Date is phase date.', 'Now, then quarterly', 11, false),
('harvests_active', 'Plants — Harvests (active / in dry)', array['MC281714'], 'Location on this report is the DRYING room, not the flower room.', 'Metrc → Plants → Harvests → Active.', 'Harvest Name, Location (dry), Weight columns if shown.', 'Now, then weekly', 12, true),
('packages_adjustments', 'Packages Adjustments', array['MC281714','MP281909'], 'Independent check vs API adjustments. Header is row 13.', 'Metrc → Reports → Packages Adjustments. Both licences. Day-one through today.', 'All columns.', 'Now as backfill, then on demand', 13, true),
('test_batches', 'Test Batches Relationships', array['MC281714','MP281909'], 'Links harvest to package to pass/fail. Fills COA gaps.', 'Metrc → Reports → Test Batches Relationships.', 'All columns.', 'Now, then quarterly', 14, false),
('wholesale_transfers', 'Wholesale Transfers', array['MC281714','MP281909'], 'Invoice number per manifest for AR.', 'Metrc → Reports → Wholesale Transfers. Both licences.', 'Invoice Number, Manifest, Destination. Header row 9.', 'Now, then quarterly', 15, false),
('apex_orders', 'Apex shipping-orders / invoices export', array['MP281909'], 'Apex official API last wrote 29 Aug. Do not use browser-session replay.', 'Apex → export current shipping-orders / invoices. Official export only.', 'Invoice number, buyer licence, dates, totals, tags if present.', 'Now, then weekly until API is alive', 16, false)
on conflict (need_key) do update set title = excluded.title, licences = excluded.licences, why = excluded.why, how_to_export = excluded.how_to_export, tick_columns = excluded.tick_columns, cadence = excluded.cadence, priority = excluded.priority, api_covers = excluded.api_covers;

create or replace view public.v_report_vault_board as
select n.need_key, n.title, n.licences, n.why, n.how_to_export, n.tick_columns, n.cadence, n.priority, n.api_covers,
       v.n_files, v.last_stored, v.last_name, v.last_licence, v.last_bytes,
       case when v.last_stored is null then 'MISSING — drop it here'
            when v.last_stored::date < (current_date - 7) then 'IN VAULT — ageing, re-export current'
            else 'IN VAULT' end as vault_status
from public.report_vault_need n
left join lateral (
  select count(*)::int as n_files, max(stored_at) as last_stored,
         (array_agg(original_name order by stored_at desc))[1] as last_name,
         (array_agg(licence order by stored_at desc))[1] as last_licence,
         (array_agg(bytes order by stored_at desc))[1] as last_bytes
  from public.report_vault r
  where r.need_key = n.need_key or r.report_key = n.need_key
) v on true
order by n.priority;

grant select on public.v_report_vault_board to authenticated;

create or replace function public.f_report_vault_guess(p_name text)
returns table(need_key text, report_key text, licence text)
language sql stable as $$
  select
    case
      when n ~ 'harvests?[[:space:]]*inactive|moisture' then 'harvests_inactive'
      when n ~ 'plantings?[[:space:]]*inactive' then 'plantings_inactive'
      when n ~ 'plantings?[[:space:]]*active' then 'plantings_active'
      when n ~ 'flowering' then 'plants_flowering'
      when n ~ 'vegetative' then 'plants_vegetative'
      when n ~ 'plants?[[:space:]]*waste|plantwaste' then 'plants_waste'
      when n ~ 'destroyed' then 'plants_destroyed'
      when n ~ 'source harvest|packages-active|packages-inactive' then 'packages_lineage'
      when n ~ 'packages?[[:space:]]*transferred' then 'packages_transferred'
      when n ~ 'lab[[:space:]]*results' then 'lab_results'
      when n ~ 'point[[:space:]]*in[[:space:]]*time|inventorypointintime' then 'inventory_point_in_time'
      when n ~ 'adjust' then 'packages_adjustments'
      when n ~ 'test[[:space:]]*batch' then 'test_batches'
      when n ~ 'wholesale' then 'wholesale_transfers'
      when n ~ 'apex|shipping-order|invoice' then 'apex_orders'
      when n ~ 'harvest' then 'harvests_active'
      else null end,
    case
      when n ~ 'harvests?[[:space:]]*inactive|moisture' then 'harvests_inactive'
      when n ~ 'packages?[[:space:]]*transferred' then 'packages_transferred'
      when n ~ 'lab[[:space:]]*results' then 'lab_results'
      when n ~ 'point[[:space:]]*in[[:space:]]*time|inventorypointintime' then 'inventory_point_in_time'
      when n ~ 'adjust' then 'packages_adjustments'
      when n ~ 'destroyed' then 'plants_destroyed'
      when n ~ 'waste' then 'plants_waste'
      when n ~ 'wholesale' then 'wholesale_transfers'
      when n ~ 'test[[:space:]]*batch' then 'test_batches'
      when n ~ 'harvest' then 'harvests'
      else null end,
    case when n ~ 'mp281909' then 'MP281909' when n ~ 'mc281714' then 'MC281714' else null end
  from (select lower(coalesce(p_name,'')) as n) s;
$$;

grant execute on function public.f_report_vault_guess(text) to authenticated;

insert into public.nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled, page_kind, surface, module)
select 'Metrc', 6, 'Vault', 'Report Vault — drop files here forever', -10, 'inbox',
       'report_vault', 'report_vault',
       'Permanent drop box. XLS / XLSX / CSV / PDF / ZIP. Bytes never delete. Parse is a later step. Stop sending reports in chat.',
       true, false, false, 'application', 'side', 'metrc'
where not exists (select 1 from public.nav_registry where view_key = 'report_vault');

