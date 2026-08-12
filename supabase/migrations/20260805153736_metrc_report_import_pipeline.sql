create table if not exists metrc_report_imports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  license text,
  file_name text,
  row_count int default 0,
  mapped_to text,
  imported_by text,
  imported_at timestamptz default now()
);
create table if not exists metrc_report_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references metrc_report_imports(id) on delete cascade,
  report_type text,
  license text,
  row_no int,
  row jsonb,
  imported_at timestamptz default now()
);
alter table metrc_report_imports enable row level security;
alter table metrc_report_rows enable row level security;
create policy mri_read on metrc_report_imports for select to authenticated using (true);
create policy mrr_read on metrc_report_rows for select to authenticated using (true);
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Metrc', (select category_order from nav_registry where category='Metrc' limit 1),
  'Report Import', 50, 'plug', 'metrc_report_import', null,
  'Pull Metrc data straight from its Reports: download any report or Admin-grid CSV from Metrc, drop it here, and it lands in the OS - items, strains, and locations included.', true, false, false
where not exists (select 1 from nav_registry where view_key = 'metrc_report_import');
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Metrc', (select category_order from nav_registry where category='Metrc' limit 1),
  'Imported Report Rows', 51, 'box', 'metrc_report_rows', 'metrc_report_rows',
  'Every row from every imported Metrc report - click any row for the complete record.', true, false, false
where not exists (select 1 from nav_registry where view_key = 'metrc_report_rows');;
