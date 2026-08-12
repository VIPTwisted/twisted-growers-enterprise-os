-- 8-week strict harvest calendar (master: TG_2026_Harvest_Calendar_STRICT_8_WEEK_CYCLE_FULL_DETAIL.xlsm, loaded 2026-08-05)
create table if not exists harvest_pulls (
  id uuid primary key default gen_random_uuid(),
  pull_no int, harvest_date date, day_of_week text, friday_flag text,
  flower_room text, room_cycle_no int, prev_facility_harvest_date date,
  facility_days_since_last_pull numeric, prev_same_room_harvest_date date,
  room_cycle_days numeric, original_total_plants numeric,
  proj_harvest_weight_g numeric, proj_harvest_weight_lbs numeric,
  original_ff_dry_lbs numeric, proj_flower_after_ff_lbs numeric,
  operating_room_plants numeric, tables numeric, plants_per_table numeric,
  operating_ff_plan_lbs numeric, day2_replant_date date,
  dry_start date, dry_day_10 date, dry_day_14 date, cultivars text,
  created_at timestamptz default now()
);
create table if not exists harvest_pull_details (
  id uuid primary key default gen_random_uuid(),
  pull_no int, harvest_date date, day_of_week text, friday_flag text,
  flower_room text, room_cycle_no int, original_harvest_date date,
  original_availability_date date, projected_availability_date date,
  cultivar text, projected_g_sqft numeric, plants numeric,
  proj_harvest_weight_g numeric, proj_harvest_weight_lbs numeric,
  ff_portion numeric, ff_weight_dry_lbs numeric, flower_after_ff_lbs numeric,
  est_total_plants_room numeric, est_tables numeric, est_plants_per_table numeric,
  operating_ff_plan_lbs numeric, day1_harvest_shift text, day1_start text, day1_end text,
  day2_replant_date date, day2_shift text, day2_start text, day2_end text,
  dry_start_date date, dry_target_day_10 date, dry_target_day_14 date,
  dry_window text, two_day_plan_notes text,
  created_at timestamptz default now()
);
create table if not exists harvest_sop_steps (
  id uuid primary key default gen_random_uuid(),
  day_label text, time_slot text, primary_goal text, lead_role text,
  person_2 text, person_3 text, person_4 text, completion_check text,
  sort int, created_at timestamptz default now()
);
create table if not exists harvest_labor_calc (
  id uuid primary key default gen_random_uuid(),
  input text, value text, formula_notes text, sort int,
  created_at timestamptz default now()
);
create table if not exists harvest_calendar_original (
  id uuid primary key default gen_random_uuid(),
  harvest_date date, flower_room text, projected_availability date, cultivar text,
  projected_g_sqft numeric, plants numeric, proj_harvest_weight_g numeric,
  proj_harvest_weight_lbs numeric, ff_portion numeric, ff_weight_dry_lbs numeric,
  flower_after_ff_lbs numeric, created_at timestamptz default now()
);
create table if not exists golive_items (
  id uuid primary key default gen_random_uuid(),
  phase int not null, phase_name text not null, title text not null, detail text,
  status text not null default 'open' check (status in ('open','in_progress','blocked','done')),
  owner_action boolean default false,
  priority text default 'P1' check (priority in ('P0','P1','P2')),
  source text, sort int,
  updated_at timestamptz default now(), created_at timestamptz default now()
);
do $$ declare t text;
begin
  foreach t in array array['harvest_pulls','harvest_pull_details','harvest_sop_steps','harvest_labor_calc','harvest_calendar_original','golive_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on %I for all to authenticated using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in (''owner'',''executive'',''manager''))) with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in (''owner'',''executive'',''manager'')))', t || '_write', t);
  end loop;
end $$;
create or replace view v_harvest_enforcement as
select p.pull_no, p.harvest_date, p.flower_room, p.room_cycle_no,
  p.room_cycle_days, p.facility_days_since_last_pull as facility_gap_days,
  case when p.harvest_date < current_date then 'past'
       when p.harvest_date <= current_date + 14 then 'upcoming' else 'scheduled' end as horizon,
  (p.room_cycle_days is not null and p.room_cycle_days <> 56) as cycle_violation,
  (p.facility_days_since_last_pull is not null and p.facility_days_since_last_pull not between 13 and 15) as cadence_violation,
  exists (select 1 from harvest_weights w where w.harvest_date = p.harvest_date and w.flower_room = p.flower_room) as weights_reported,
  (p.harvest_date < current_date and not exists (select 1 from harvest_weights w
     where w.harvest_date = p.harvest_date and w.flower_room = p.flower_room)) as overdue_reporting,
  exists (select 1 from harvest_pulls p2 where p2.harvest_date = p.harvest_date and p2.id <> p.id) as same_day_overlap,
  p.day2_replant_date, p.dry_start, p.dry_day_14, p.cultivars
from harvest_pulls p order by p.harvest_date;
alter table nav_registry add column if not exists sync_enabled boolean default false;
update nav_registry set sync_enabled = true where view_key in
  ('grow_rooms','harvest_schedule','harvests','grading','harvest_recon','fg_metrc_check','fg_inventory');
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select (select category from nav_registry where view_key='harvest_schedule' limit 1),
       (select category_order from nav_registry where view_key='harvest_schedule' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, v.adm, v.sy
from (values
  ('Harvest Calendar (8-Week)', 20, 'clock', 'harvest_pulls', 'harvest_pulls', '2026-2030 strict 8-week cycle: every pull, room rotation F3-F4-F1-F2, dry windows, replant dates.', false, true),
  ('Harvest Detail by Cultivar', 21, 'scale', 'harvest_detail', 'harvest_pull_details', 'Per-cultivar projections for every pull: g/sqft, plants, fresh-frozen split, dry targets.', false, true),
  ('Harvest SOP - 2-Day Plan', 22, 'board', 'harvest_sop', 'harvest_sop_steps', 'Hour-by-hour 2-day harvest and replant operation: roles, goals, completion checks.', false, false),
  ('Harvest Labor Calculator', 23, 'gauge', 'harvest_labor', 'harvest_labor_calc', 'Labor capacity inputs and pace scenarios for the 2-day harvest clock.', false, false),
  ('Cycle Enforcement', 24, 'shield', 'harvest_enforce', 'v_harvest_enforcement', 'Live policing of the 8-week cycle: 56-day room cycles, 13-15 day facility cadence, overdue weight reporting, overlaps.', false, true)
) v(l, io, ic, vk, tr, d, adm, sy)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), 'Go-Live Tracker', 9, 'check', 'golive', 'golive_items', 'Live to-do list before testing deploy and go-live: every open build, data, integration, and hardening item.', true, true, false
where not exists (select 1 from nav_registry where view_key='golive');
update grow_rooms set cycle_days = 56,
  notes = coalesce(notes,'') || ' | Cycle corrected 63d->56d per TG 2026 8-Week Harvest Calendar (owner-declared master, synced 2026-08-05).';;
