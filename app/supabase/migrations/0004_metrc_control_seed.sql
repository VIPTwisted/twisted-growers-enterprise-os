-- TG Enterprise OS — 0004 Metrc staging, Control Tower, Seeds
-- CODE-010 integrations, CODE-011 Executive Control Tower, CODE-018 Metrc API connector
-- Metrc posture per blueprint: READ-FIRST; compliance record always wins; full-tag fidelity.

-- ===== Metrc staging (raw truth from the state system) =====
create table metrc_sync_runs (
  id bigint generated always as identity primary key,
  endpoint text not null,
  license text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',       -- running | ok | error
  records int not null default 0,
  error text
);

create table metrc_packages (
  id bigint generated always as identity primary key,
  license text not null,
  tag text not null,                            -- full 24-char tag
  item_name text,
  quantity numeric(14,3),
  uom text,
  location text,
  packaged_on date,
  lab_testing_state text,
  finished boolean,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  unique (license, tag)
);

create table metrc_harvests (
  id bigint generated always as identity primary key,
  license text not null,
  metrc_id bigint not null,
  name text,
  harvest_start date,
  wet_weight numeric(14,3),
  waste_weight numeric(14,3),
  package_count int,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  unique (license, metrc_id)
);

create table metrc_plants (
  id bigint generated always as identity primary key,
  license text not null,
  tag text not null,
  strain text,
  phase text,                                   -- vegetative | flowering
  room text,
  planted_on date,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  unique (license, tag)
);

create table metrc_plant_batches (
  id bigint generated always as identity primary key,
  license text not null,
  name text not null,
  strain text,
  count int,
  batch_type text,
  planted_on date,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  unique (license, name)
);

create table metrc_lab_results (
  id bigint generated always as identity primary key,
  license text not null,
  package_tag text,
  test_type text,
  result numeric(12,4),
  passed boolean,
  result_date date,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  unique (license, package_tag, test_type, result_date)
);

create table metrc_transfers (
  id bigint generated always as identity primary key,
  license text not null,
  manifest_number text not null,
  direction text not null,                       -- incoming | outgoing
  shipper text,
  recipient text,
  created_on date,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  unique (license, manifest_number, direction)
);

create table reconciliation_exceptions (
  id bigint generated always as identity primary key,
  domain text not null,                          -- packages | harvests | plants | lab | transfers
  planner_ref text,
  metrc_ref text,
  kind text not null,                            -- missing_in_planner | missing_in_metrc | qty_mismatch | status_mismatch
  detail jsonb,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

-- ===== Monday integration bookkeeping (CODE-010 / MON-001..006) =====
create table integration_mappings (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  planner_entity text not null,
  monday_workspace_id text,
  monday_board_id text,
  column_map jsonb,
  sync_direction text not null default 'planner_to_monday',
  approval text not null default 'pending',
  status text not null default 'not_connected',
  last_synced_at timestamptz
);

create table sync_conflicts (
  id bigint generated always as identity primary key,
  mapping_id uuid references integration_mappings(id),
  entity_ref text,
  planner_value jsonb,
  external_value jsonb,
  status text not null default 'open',
  opened_at timestamptz not null default now()
);

-- ===== Control tower (CODE-011): live views, never separately-typed numbers =====
create table kpi_snapshots (
  id bigint generated always as identity primary key,
  as_of date not null,
  metric text not null,
  value numeric(18,4),
  unique (as_of, metric)
);

create table actions_register (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  priority text not null default 'P1',
  owner_id uuid references employees(id),
  due_on date,
  status text not null default 'open',
  source text,
  note text,
  created_at timestamptz not null default now()
);

create or replace view v_control_tower as
select 'late_or_at_risk_orders' as metric, count(*)::numeric as value
  from sales_orders where status in ('open','confirmed') and promised_ship_on < current_date
union all
select 'unconfirmed_open_orders', count(*) from sales_orders where status = 'open'
union all
select 'testing_overdue', count(*) from test_requests
  where status in ('planned','submitted','at_lab') and submit_due_on < current_date
union all
select 'lots_rts_missing_coa', count(*) from lots
  where status = 'ready_to_ship' and coa_id is null
union all
select 'lots_expired_sellable', count(*) from lots
  where expires_on < current_date and status in ('ready_to_ship','packaging','packaging_queue')
union all
select 'pending_allocations', count(*) from allocations where approval = 'pending'
union all
select 'blocked_work_orders', count(*) from work_orders w
  where w.status in ('ready','released')
    and not exists (select 1 from allocations a where a.work_order_id = w.id and a.release = 'released')
union all
select 'harvest_mass_balance_exceptions', count(*) from harvest_grades
  where dry_input_g > 0 and abs(variance_g) > 0.01
union all
select 'licenses_expiring_60d', count(*) from licenses
  where status = 'active' and expires_on <= current_date + 60
union all
select 'open_p0_actions', count(*) from actions_register where priority = 'P0' and status <> 'complete'
union all
select 'metrc_reconciliation_open', count(*) from reconciliation_exceptions where status = 'open'
union all
select 'days_since_cash_update',
  coalesce(extract(day from now() - (select max(as_of)::timestamptz from cash_snapshots)), 999);

-- ===== Seeds: canonical reference data (from v5 Reference Tables + harvest history) =====
insert into departments (name, sort) values
 ('Cultivation',1),('Trimming',2),('Flower/Infused Pre-Rolls',3),('Cheap Pre-Rolls',4),
 ('Extraction',5),('Packaging',6),('Shipping/Support',7),('Quality & Testing',8);

insert into product_families (name, home_department_id) values
 ('Flower 3.5g',(select id from departments where name='Packaging')),
 ('Vapes',(select id from departments where name='Extraction')),
 ('Infused Pre-Rolls',(select id from departments where name='Flower/Infused Pre-Rolls')),
 ('Regular Pre-Rolls',(select id from departments where name='Cheap Pre-Rolls'));

insert into grow_rooms (code, legacy_label, plant_capacity, cycle_days, active) values
 ('F1','Grow Room 1',190,63,true),
 ('F2','Grow Room 2',210,63,true),
 ('F3','Grow Room 3',190,63,true),
 ('F4','Grow Room 4',210,63,true);

insert into roles_catalog (department_id, name) values
 ((select id from departments where name='Cultivation'),'Cultivation Technician'),
 ((select id from departments where name='Trimming'),'Trimmer'),
 ((select id from departments where name='Flower/Infused Pre-Rolls'),'Pre-Roll Production Operator'),
 ((select id from departments where name='Cheap Pre-Rolls'),'Weigh & QC'),
 ((select id from departments where name='Cheap Pre-Rolls'),'Tubing & Labeling'),
 ((select id from departments where name='Extraction'),'Extraction Operator'),
 ((select id from departments where name='Packaging'),'Packaging & Labels'),
 ((select id from departments where name='Packaging'),'Finished Goods'),
 ((select id from departments where name='Shipping/Support'),'Shipping Coordinator');

insert into cultivars (canonical_name, aliases) values
 ('Apple Fritter','{}'),('Lemon Drop','{}'),('Spec Ops','{SpecOps}'),('Gush Mintz','{}'),
 ('Glitter Bomb','{}'),('Strawberry Biscotti','{Strawberry Bicotti}'),('MAC','{MAC 1}'),
 ('Cap Junky','{}'),('Super Boof','{}'),('Blue Dream','{}'),('Hella Jelly','{}'),
 ('XJ-13','{}'),('Orange Cream','{}'),('Pink Drink','{}'),('Moraccan Peaches','{Moraccan Paches,Moraccan Paches/Dirty Taxi}'),
 ('Chimera','{}'),('LMNT 115','{LMNT}'),('Shake Shack','{}'),('Satsuma Sherbet','{Satsuma Sherbert}'),
 ('Gastro Pop','{}'),('Warheads','{}'),('Fluffernutter','{}'),('PB&J','{}'),
 ('Zombie Apocalypse','{}'),('Modified Funk','{}'),('Afternoon Delight','{}'),
 ('Strawberry Cookies','{Strawberry Cookie}'),('Dr. Rendezvous','{}'),('Senor Giggles','{Señor Giggles}'),
 ('Lemoncello Spritz','{Lemoncello Sprtiz}');

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
           and tablename in ('metrc_sync_runs','metrc_packages','metrc_harvests','metrc_plants',
                             'metrc_plant_batches','metrc_lab_results','metrc_transfers',
                             'reconciliation_exceptions','integration_mappings','sync_conflicts',
                             'kpi_snapshots','actions_register')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy exec_all on public.%I for all using (is_executive()) with check (is_executive())', t);
  end loop;
end $$;
