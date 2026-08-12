create table if not exists agent_departments (
  id text primary key,
  name text not null,
  charter text not null,
  owns text,
  standing_priorities text,
  active boolean default true,
  created_at timestamptz default now()
);
alter table agent_departments enable row level security;
create policy ad_read on agent_departments for select to authenticated using (true);
create policy ad_write on agent_departments for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')));
insert into agent_departments (id, name, charter, owns, standing_priorities) values
('TG-01', 'Metrc & Compliance', 'Metrc sync workers, seed-to-sale mirroring, full report clones, discrepancy hunting across both licenses.', 'metrc-sync worker, metrc_* tables, report views, cursors, historical backfill', 'Worker v13: lab tests/Certificates of Analysis, manifest lines, waste/destroys, adjustments, units of measure; historical backfill; every-filter report clone'),
('TG-02', 'Cultivation & Harvest', 'The 8-week cycle enforced and policed: calendar, pulls, weights, rooms, clone/veg.', 'harvest_pulls + details + SOP + labor calc, v_harvest_enforcement, harvest_weights, grow_rooms', '15 past pulls missing weights; reminders + escalation; room yield planning'),
('TG-03', 'Manufacturing & Pipelines', 'Every material - grown, bought, manufactured - through stages into finished goods, fast.', '10 pipelines, pipeline_runs/stage_events, turnaround_policies, v_turnaround_watch, work orders', 'Pipeline builder UI + Start Run from allocation + Advance Stage; production tracking layer; Vinny turnaround policies'),
('TG-04', 'Inventory & Allocations', 'Finished goods, packaging supplies, allocation approvals, planning and forecasting.', 'product_inventory, supply_items, third_party_material, material aging, allocation flow', 'Allocation ledger + Vincent approval chain; per-product planning-forecasting; packaging counts'),
('TG-05', 'Human Resources', 'Real roster, schedules, payroll forecasting, CCC-compliant employee files, timesheets.', 'employees, roles_catalog, departments, schedules, v_payroll_forecast', 'Real pay rates (17 of 21 placeholder); employee files with documents; timesheets suite'),
('TG-06', 'Finance, Cash & QuickBooks', 'Cash freshness, QuickBooks sync, cost analysis, budgets.', 'cash age monitoring, QUICKBOOKS_ integration slot, cost views, budgets', 'QuickBooks Online OAuth + sync worker; cash data pipeline'),
('TG-07', 'Sales, Orders & Fulfillment', 'Orders through packing, manifests, delivery - Ready-To-Ship gated on Certificates of Analysis.', 'orders, shipments, transfers (with TG-01), customer notes', 'Order fulfillment flow; late/at-risk flags; Certificate of Analysis gating'),
('TG-08', 'Integrations & Connectors', 'Sync Center and every external bridge, under the selective-sharing law.', 'sheet-sync, clickup-sync/customize, Monday build, integration-settings vault', 'Monday pull-sync (team live tool, P0); three locked Google Sheets; QuickBooks keys'),
('TG-09', 'Brain, Loops & Automations', 'The OS that thinks: Brain overhaul, memory pipeline, scheduled loops, alert rules, approval workflows.', 'TG Brain, brain memory pipeline, loops manager, alert rules engine, workflows engine', 'Brain ops overhaul (P0): critical board, role briefings, night-shift loops'),
('TG-10', 'Design & UI Standards', 'Guardian of the locked theme and the ClickUp-grade experience - enforces, never alters.', 'views engine UX, component consistency, both themes, print styles', 'Theme LOCKED: neon green, no purple, no grey/pastel, Figtree, no abbreviations, color code green/red/amber'),
('TG-11', 'QA & Independent Verification', 'Adversarial verification: reproduce before believing, refute before approving.', 'reviews, per-role permission checks, RLS audits, empty-state audits, performance', 'Full QA pass; per-role hide verification; RLS + storage audit'),
('TG-12', 'Register & Go-Live', 'Nothing omitted, ever: every directive captured, prioritized, and drilled to closure.', 'actions_register, golive_items, owner-action standing list', 'Work the ~240 open register items; keep the Go-Live Tracker true')
on conflict (id) do update set name = excluded.name, charter = excluded.charter, owns = excluded.owns, standing_priorities = excluded.standing_priorities;
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1),
  'Agent Departments', 10, 'users', 'agent_departments', 'agent_departments',
  'The build org: 12 standing agent departments under the acting COO - charters, ownership, and standing priorities.', true, true, false
where not exists (select 1 from nav_registry where view_key = 'agent_departments');;
