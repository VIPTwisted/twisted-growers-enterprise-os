alter table pipeline_runs add column if not exists brand text;
alter table pipeline_runs add column if not exists sku text;
alter table pipeline_runs add column if not exists category text;
update pipelines set name = 'Non-Infused Pre-Rolls (from Trim/Flower)' where name = 'Pre-Rolls from Trim';
update pipelines set name = 'Packaged Flower' where name = 'Flower Packaging';
with pl as (
  insert into pipelines (name, description, material_kind) values
  ('Infused Pre-Rolls', 'Flower/trim plus concentrate infusion through rolling, packaging, labeling into finished goods - all brands.', 'manufactured'),
  ('Vape Cartridge Production', 'Concentrate through cartridge filling, capping, quality check, tubes, packaging into finished goods - all brands.', 'manufactured'),
  ('Purchased Flower Turnaround', 'Bought flower cannot sit: received through inspection, allocation to a production line or packaging, into finished goods fast.', 'purchased'),
  ('Purchased Concentrate Turnaround', 'Bought concentrate cannot sit: received through inspection, straight into vapes/infusion/packaging, into finished goods fast.', 'purchased')
  returning id, name
)
insert into pipeline_stages (pipeline_id, stage_no, name, target_hours)
select id, s.n, s.nm, s.h from pl, lateral (values
  (1, 'Material Allocated (flower/trim + concentrate)', 24), (2, 'Prep / Grind', 24), (3, 'Infusion', 48),
  (4, 'Rolling / Filling', 48), (5, 'Quality Check', 24), (6, 'Tubes / Packaging', 48), (7, 'Labeling (brand)', 24), (8, 'Finished Goods', 24)
) s(n, nm, h) where pl.name = 'Infused Pre-Rolls'
union all
select id, s.n, s.nm, s.h from pl, lateral (values
  (1, 'Concentrate Allocated', 24), (2, 'Cartridge Filling', 48), (3, 'Capping', 24),
  (4, 'Quality Check', 24), (5, 'Tubes / Outer Boxes', 48), (6, 'Labeling (brand)', 24), (7, 'Finished Goods', 24)
) s(n, nm, h) where pl.name = 'Vape Cartridge Production'
union all
select id, s.n, s.nm, s.h from pl, lateral (values
  (1, 'Received', 24), (2, 'Inspection / Intake to Metrc', 24), (3, 'Allocated to Line or Packaging', 48),
  (4, 'Processing / Packaging', 96), (5, 'Finished Goods', 24)
) s(n, nm, h) where pl.name = 'Purchased Flower Turnaround'
union all
select id, s.n, s.nm, s.h from pl, lateral (values
  (1, 'Received', 24), (2, 'Inspection / Intake to Metrc', 24), (3, 'Allocated to Vapes / Infusion', 48),
  (4, 'Production / Packaging', 96), (5, 'Finished Goods', 24)
) s(n, nm, h) where pl.name = 'Purchased Concentrate Turnaround';
create table if not exists turnaround_policies (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('default','category','sku','item','brand')),
  scope_value text,
  applies_to text default 'any' check (applies_to in ('purchased','manufactured','grown','any')),
  max_days numeric not null,
  note text,
  active boolean default true,
  created_by text,
  created_at timestamptz default now()
);
alter table turnaround_policies enable row level security;
create policy tp_read on turnaround_policies for select to authenticated using (true);
create policy tp_write on turnaround_policies for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));
drop view if exists v_pipeline_run_status;
create view v_pipeline_run_status as
select r.id, p.name as pipeline, r.brand, r.sku, r.category, r.material_name, r.quantity, r.uom,
  r.source_kind, r.source_ref, r.started_at::date as started,
  s.name as current_stage,
  (select count(*) from pipeline_stage_events e where e.run_id = r.id and e.exited_at is not null) as stages_done,
  (select count(*) from pipeline_stages ps where ps.pipeline_id = r.pipeline_id) as stages_total,
  round(extract(epoch from (now() - coalesce((select max(e.entered_at) from pipeline_stage_events e where e.run_id = r.id and e.exited_at is null), r.started_at))) / 3600, 1) as hours_in_current_stage,
  round(extract(epoch from (coalesce(r.completed_at, now()) - r.started_at)) / 3600, 1) as total_hours_elapsed,
  s.target_hours as stage_target_hours,
  (r.completed_at is null and s.target_hours is not null
    and extract(epoch from (now() - coalesce((select max(e.entered_at) from pipeline_stage_events e where e.run_id = r.id and e.exited_at is null), r.started_at))) / 3600 > s.target_hours) as stage_overdue,
  (r.completed_at is not null) as completed,
  r.finished_good_lot
from pipeline_runs r
join pipelines p on p.id = r.pipeline_id
left join pipeline_stages s on s.id = r.current_stage_id
order by r.started_at desc;
create or replace view v_turnaround_watch as
select r.id, p.name as pipeline, r.brand, r.sku, r.category, r.material_name, r.source_kind,
  r.started_at::date as started,
  round(extract(epoch from (now() - r.started_at)) / 86400, 1) as days_open,
  pol.max_days as policy_max_days,
  pol.scope as policy_scope,
  (pol.max_days is not null and extract(epoch from (now() - r.started_at)) / 86400 > pol.max_days) as turnaround_violation,
  (pol.max_days is null) as no_policy_set
from pipeline_runs r
join pipelines p on p.id = r.pipeline_id
left join lateral (
  select tp.max_days, tp.scope from turnaround_policies tp
  where tp.active
    and (tp.applies_to = 'any' or tp.applies_to = r.source_kind)
    and ((tp.scope = 'sku' and tp.scope_value = r.sku)
      or (tp.scope = 'item' and tp.scope_value = r.material_name)
      or (tp.scope = 'brand' and tp.scope_value = r.brand)
      or (tp.scope = 'category' and tp.scope_value = r.category)
      or tp.scope = 'default')
  order by case tp.scope when 'sku' then 1 when 'item' then 2 when 'brand' then 3 when 'category' then 4 else 5 end
  limit 1
) pol on true
where r.completed_at is null
order by days_open desc;
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Manufacturing', (select category_order from nav_registry where category='Manufacturing' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Turnaround Policies', 33, 'shield', 'turnaround_policies', 'turnaround_policies', 'The turnaround law: maximum days before purchased or manufactured material must reach finished goods - set by default or per SKU, category, item, or brand.'),
  ('Turnaround Watch', 34, 'clock', 'turnaround_watch', 'v_turnaround_watch', 'Every open run against its turnaround policy: days open, violations in red, runs with no policy flagged. Money does not sit.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
insert into golive_items (phase, phase_name, title, detail, owner_action, priority, source, sort) values
(2,'Data Completeness','Vinny: set turnaround policies','Turnaround Policies table is live and empty by design - Vinny inputs the default max-days plus any per-SKU/category/item/brand overrides. Until then Turnaround Watch flags every run as no-policy-set.',true,'P0','owner',26);;
