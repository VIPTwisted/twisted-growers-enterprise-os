-- Manufacturing pipelines: any material (grown/purchased/harvested/manufactured) tracked
-- through user-editable stages to finished goods, with dwell time per stage.
create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  material_kind text default 'any' check (material_kind in ('grown','purchased','manufactured','any')),
  active boolean default true,
  created_at timestamptz default now()
);
create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  stage_no int not null,
  name text not null,
  target_hours numeric,
  description text,
  created_at timestamptz default now()
);
create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id),
  material_name text not null,
  source_kind text check (source_kind in ('grown','purchased','harvested','manufactured')),
  source_ref text,
  quantity numeric,
  uom text,
  started_at timestamptz default now(),
  current_stage_id uuid references pipeline_stages(id),
  completed_at timestamptz,
  finished_good_lot text,
  notes text
);
create table if not exists pipeline_stage_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pipeline_runs(id) on delete cascade,
  stage_id uuid not null references pipeline_stages(id),
  entered_at timestamptz default now(),
  exited_at timestamptz,
  entered_by text,
  note text
);
do $$ declare t text;
begin
  foreach t in array array['pipelines','pipeline_stages','pipeline_runs','pipeline_stage_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on %I for all to authenticated using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in (''owner'',''executive'',''manager''))) with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in (''owner'',''executive'',''manager'')))', t || '_write', t);
  end loop;
end $$;
create or replace view v_pipeline_run_status as
select r.id, p.name as pipeline, r.material_name, r.quantity, r.uom,
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
create or replace view v_pipeline_stage_aging as
select p.name as pipeline, ps.stage_no, ps.name as stage, ps.target_hours,
  count(e.id) as times_entered,
  round(avg(extract(epoch from (coalesce(e.exited_at, now()) - e.entered_at)) / 3600)::numeric, 1) as avg_hours,
  round(max(extract(epoch from (coalesce(e.exited_at, now()) - e.entered_at)) / 3600)::numeric, 1) as max_hours
from pipeline_stages ps
join pipelines p on p.id = ps.pipeline_id
left join pipeline_stage_events e on e.stage_id = ps.id
group by p.name, ps.stage_no, ps.name, ps.target_hours
order by p.name, ps.stage_no;
-- Company pipeline definitions (config rows, editable; runs stay empty until real material moves)
with pl as (
  insert into pipelines (name, description, material_kind) values
  ('Pre-Rolls from Trim', 'Trim allocation through rolling, packaging, and into finished goods.', 'grown'),
  ('Flower Packaging', 'Dried flower allocation through jarring/bagging into finished goods.', 'grown'),
  ('Concentrate Manufacturing', 'Extraction material through processing, filling, packaging into finished goods.', 'grown'),
  ('Purchased Material Intake', 'Received purchases through inspection into released inventory.', 'purchased')
  returning id, name
)
insert into pipeline_stages (pipeline_id, stage_no, name, target_hours)
select id, s.n, s.nm, s.h from pl, lateral (values
  (1, 'Material Allocated', 24), (2, 'Prep / Grind', 24), (3, 'Rolling / Filling', 48),
  (4, 'Quality Check', 24), (5, 'Packaging', 48), (6, 'Labeling', 24), (7, 'Finished Goods', null)
) s(n, nm, h) where pl.name = 'Pre-Rolls from Trim'
union all
select id, s.n, s.nm, s.h from pl, lateral (values
  (1, 'Flower Allocated', 24), (2, 'Bucking / Sort', 48), (3, 'Jarring / Bagging', 48),
  (4, 'Labeling', 24), (5, 'Finished Goods', null)
) s(n, nm, h) where pl.name = 'Flower Packaging'
union all
select id, s.n, s.nm, s.h from pl, lateral (values
  (1, 'Material Allocated', 24), (2, 'Extraction', 72), (3, 'Post-Processing', 72),
  (4, 'Filling', 48), (5, 'Packaging', 48), (6, 'Finished Goods', null)
) s(n, nm, h) where pl.name = 'Concentrate Manufacturing'
union all
select id, s.n, s.nm, s.h from pl, lateral (values
  (1, 'Received', 24), (2, 'Quarantine / Inspection', 48), (3, 'Released to Inventory', null)
) s(n, nm, h) where pl.name = 'Purchased Material Intake';
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Manufacturing', (select category_order from nav_registry where category='Manufacturing' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Production Pipelines', 30, 'flask', 'pipelines_def', 'pipelines', 'Every pipeline the company runs - grown, purchased, or manufactured material through stages into finished goods. Editable as data, no code.'),
  ('Pipeline Runs (Live)', 31, 'clock', 'pipeline_runs', 'v_pipeline_run_status', 'Every batch moving through a pipeline right now: current stage, hours in stage, overdue flags, total elapsed time to finished goods.'),
  ('Pipeline Stage Aging', 32, 'gauge', 'pipeline_aging', 'v_pipeline_stage_aging', 'Average and worst dwell time per stage vs target - where production slows down.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);;
