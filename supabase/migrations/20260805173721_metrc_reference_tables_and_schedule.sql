create table if not exists metrc_units_of_measure (
  id uuid primary key default gen_random_uuid(), license text, name text, abbreviation text,
  quantity_type text, raw jsonb, synced_at timestamptz default now(), unique(license, name));
create table if not exists metrc_employees (
  id uuid primary key default gen_random_uuid(), license text, full_name text, employee_license text,
  raw jsonb, synced_at timestamptz default now(), unique(license, full_name));
create table if not exists metrc_item_categories (
  id uuid primary key default gen_random_uuid(), license text, name text, category_type text,
  quantity_type text, requires_strain boolean, raw jsonb, synced_at timestamptz default now(), unique(license, name));
create table if not exists metrc_lab_test_types (
  id uuid primary key default gen_random_uuid(), license text, metrc_id bigint, name text,
  requires_result boolean, informational boolean, raw jsonb, synced_at timestamptz default now(), unique(license, metrc_id));
create table if not exists metrc_waste_types (
  id uuid primary key default gen_random_uuid(), license text, name text, raw jsonb,
  synced_at timestamptz default now(), unique(license, name));
do $$ declare t text;
begin
  foreach t in array array['metrc_units_of_measure','metrc_employees','metrc_item_categories','metrc_lab_test_types','metrc_waste_types'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_read', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t||'_read', t);
  end loop;
end $$;
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Metrc', (select category_order from nav_registry where category='Metrc' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, true
from (values
  ('Reference: Units of Measure', 60, 'scale', 'metrc_uom', 'metrc_units_of_measure', 'Every unit of measure Metrc recognises, with its abbreviation and quantity type.'),
  ('Reference: Metrc Employees', 61, 'users', 'metrc_employees', 'metrc_employees', 'Every employee registered on the Metrc licence, with their state employee licence number.'),
  ('Reference: Item Categories', 62, 'box', 'metrc_item_categories', 'metrc_item_categories', 'Every product category Metrc allows, whether it is weight or count based, and whether it requires a strain.'),
  ('Reference: Laboratory Test Types', 63, 'flask', 'metrc_lab_types', 'metrc_lab_test_types', 'Every laboratory test Metrc defines, and whether each requires a result or is informational only.'),
  ('Reference: Waste Types', 64, 'shield', 'metrc_waste_types', 'metrc_waste_types', 'Every waste reason code Metrc accepts when recording harvest waste.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
-- Automatic: reference nightly, delivery walk every 10 minutes until customer names are filled
select cron.unschedule(jobid) from cron.job where jobname in ('metrc-reference','metrc-deliveries');
select cron.schedule('metrc-reference', '20 7 * * *',
  $$ select net.http_post(url := 'https://fxetuqjryttnypgepsru.supabase.co/functions/v1/metrc-reference-sync?mode=reference',
     headers := '{"x-admin-key": "tg-seed-8f3k2m-2026", "Content-Type": "application/json"}'::jsonb,
     body := '{}'::jsonb, timeout_milliseconds := 280000) $$);
select cron.schedule('metrc-deliveries', '*/10 * * * *',
  $$ select net.http_post(url := 'https://fxetuqjryttnypgepsru.supabase.co/functions/v1/metrc-reference-sync?mode=deliveries&limit=60',
     headers := '{"x-admin-key": "tg-seed-8f3k2m-2026", "Content-Type": "application/json"}'::jsonb,
     body := '{}'::jsonb, timeout_milliseconds := 280000) $$);
select 'scheduled' as ok;;
