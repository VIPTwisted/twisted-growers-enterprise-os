create table if not exists dashboards (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  name text not null,
  is_private boolean not null default true,
  created_at timestamptz default now()
);
create table if not exists dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  widget_key text not null,
  position int default 0,
  created_at timestamptz default now()
);
create table if not exists widget_catalog (
  key text primary key,
  category text not null,
  label text not null,
  icon text default 'gauge',
  table_ref text not null,
  agg text not null default 'count' check (agg in ('count','sum')),
  value_col text,
  filters jsonb default '[]'::jsonb,
  drill text,
  format text,
  hot boolean default false,
  enabled boolean default true
);
alter table dashboards enable row level security;
alter table dashboard_widgets enable row level security;
alter table widget_catalog enable row level security;
create policy dashboards_read on dashboards for select to authenticated
  using (owner = auth.uid() or is_private = false);
create policy dashboards_write on dashboards for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy dw_read on dashboard_widgets for select to authenticated
  using (exists (select 1 from dashboards d where d.id = dashboard_id and (d.owner = auth.uid() or d.is_private = false)));
create policy dw_write on dashboard_widgets for all to authenticated
  using (exists (select 1 from dashboards d where d.id = dashboard_id and d.owner = auth.uid()))
  with check (exists (select 1 from dashboards d where d.id = dashboard_id and d.owner = auth.uid()));
create policy wc_read on widget_catalog for select to authenticated using (true);
create policy wc_write on widget_catalog for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')));
insert into widget_catalog (key, category, label, icon, table_ref, agg, value_col, filters, drill, format, hot) values
('p0_actions','Command','Open P0 actions','shield','actions_register','count',null,'[{"op":"eq","col":"status","val":"open"},{"op":"eq","col":"priority","val":"P0"}]','action_register',null,true),
('open_actions','Command','Open actions (all)','board','actions_register','count',null,'[{"op":"eq","col":"status","val":"open"}]','action_register',null,false),
('golive_open','Command','Go-live items open','check','golive_items','count',null,'[{"op":"neq","col":"status","val":"done"}]','golive',null,true),
('metrc_pkgs','Compliance','Metrc packages','box','metrc_packages','count',null,'[]','metrc_mirror',null,false),
('metrc_plants','Compliance','Plants (Metrc)','leafline','metrc_plants','count',null,'[]','metrc_mirror',null,false),
('metrc_harvests','Compliance','Harvests recorded','scale','metrc_harvests','count',null,'[]','harvest_recon',null,false),
('metrc_transfers','Compliance','Transfer manifests','truck','metrc_transfers','count',null,'[]','metrc_mirror',null,false),
('recon_missing','Compliance','Missing in Metrc','shield','v_harvest_reconciliation','count',null,'[{"op":"eq","col":"reconciliation","val":"MISSING IN METRC"}]','harvest_recon',null,true),
('pulls_ahead','Cultivation','Pulls scheduled ahead','clock','harvest_pulls','count',null,'[{"op":"gte","col":"harvest_date","val":"$today"}]','harvest_pulls',null,false),
('pulls_overdue','Cultivation','Pulls missing weights','shield','v_harvest_enforcement','count',null,'[{"op":"eq","col":"overdue_reporting","val":true}]','harvest_enforce',null,true),
('cycle_viol','Cultivation','Cycle violations','shield','v_harvest_enforcement','count',null,'[{"op":"eq","col":"cycle_violation","val":true}]','harvest_enforce',null,true),
('cadence_viol','Cultivation','Cadence violations','shield','v_harvest_enforcement','count',null,'[{"op":"eq","col":"cadence_violation","val":true}]','harvest_enforce',null,true),
('sched_events','Cultivation','Calendar events ahead','clock','harvest_schedule','count',null,'[{"op":"gte","col":"harvest_date","val":"$today"}]','harvest_schedule',null,false),
('fg_lots','Inventory','Finished-goods lots','box','product_inventory','count',null,'[]','fg_inventory',null,false),
('fg_rts','Inventory','Ready To Ship','check','product_inventory','count',null,'[{"op":"eq","col":"current_status","val":"Ready To Ship"}]','fg_inventory',null,false),
('fg_expiring','Inventory','Expiring within 30d','clock','product_inventory','count',null,'[{"op":"lt","col":"expiration_date","val":"$in30"}]','inv_summary',null,true),
('tp_lots','Inventory','3rd-party lots on site','truck','third_party_material','count',null,'[]','third_party',null,false),
('supply_types','Inventory','Packaging supply types','box','supply_items','count',null,'[]','supplies',null,false),
('cap_tied','Inventory','Capital tied up (lots)','dollar','v_material_aging','count',null,'[{"op":"eq","col":"aging_alert","val":"CAPITAL TIED UP"}]','materials',null,true),
('emp_active','Human Resources','Active employees','users','employees','count',null,'[{"op":"is_null","col":"terminated_on"}]','people',null,false),
('emp_today','Human Resources','Scheduled today','clock','employee_schedules','count',null,'[{"op":"eq","col":"work_date","val":"$today"}]','emp_schedule',null,false),
('time_exc','Human Resources','Exceptions today','bell','time_entries','count',null,'[{"op":"eq","col":"work_date","val":"$today"},{"op":"not_null","col":"exception_code"}]','time',null,true),
('payroll_wk','Human Resources','Weekly loaded payroll','dollar','v_payroll_forecast','sum','loaded_weekly_cost','[]','plan_payroll','usd',false),
('tasks_open','Workspace','Tasks open','board','tasks','count',null,'[{"op":"neq","col":"status","val":"done"}]','tasks',null,false),
('issues_open','Workspace','Issues reported open','bell','issue_reports','count',null,'[{"op":"eq","col":"status","val":"open"}]','issues',null,true),
('sla_rules','Quality','Testing SLA rules active','shield','testing_slas','count',null,'[{"op":"eq","col":"active","val":true}]','testing_sla',null,false)
on conflict (key) do nothing;
update nav_registry set label = 'Human Resources' where lower(label) = 'people';;
