-- What is happening in every room right now, and what is coming.
create or replace view v_room_board as
-- Flower rooms: live plants and the next scheduled pull
select
  gr.code as room,
  'Flower room' as room_type,
  (select count(*) from metrc_plants p where p.room ilike '%'||replace(gr.code,'F','Flower Room #')||'%'
     and p.source_state in ('vegetative','flowering','onhold'))::numeric as plants_now,
  (select string_agg(distinct p.strain, ', ') from metrc_plants p
     where p.room ilike '%'||replace(gr.code,'F','Flower Room #')||'%' and p.source_state in ('vegetative','flowering','onhold')) as strains_now,
  null::numeric as weight_on_hand,
  (select min(hp.harvest_date) from harvest_pulls hp where hp.flower_room = gr.code and hp.harvest_date >= current_date) as next_event_date,
  'Next scheduled pull' as next_event,
  (select (hp.harvest_date - current_date) from harvest_pulls hp
     where hp.flower_room = gr.code and hp.harvest_date >= current_date order by hp.harvest_date limit 1)::numeric as days_until,
  (select hp.cultivars from harvest_pulls hp where hp.flower_room = gr.code and hp.harvest_date >= current_date order by hp.harvest_date limit 1) as next_event_detail,
  gr.plant_capacity, gr.cycle_days
from grow_rooms gr where gr.active
union all
-- Drying, curing and trim rooms: what is physically in them and the deadline
select
  m.room, 'Post-harvest room',
  sum(m.plants)::numeric,
  string_agg(distinct m.strains, ', '),
  round(sum(coalesce(m.current_weight, m.wet_weight, 0))::numeric, 1),
  min(m.harvest_start + 14),
  'Dry deadline (day 14)',
  min(m.harvest_start + 14 - current_date)::numeric,
  string_agg(distinct m.stage, ' · '),
  null, null
from v_harvest_stage_map m
where m.stage not in ('Finished','Archived') and coalesce(m.room,'') <> ''
group by m.room;

-- What each department is responsible for right now.
create or replace view v_department_board as
select 'Cultivation' as department,
  (select count(*) from v_harvest_lifecycle where verdict in ('BLOCKING THE ROOM','MISSING WEIGHTS','HARVESTED LATE'))::numeric as items_needing_action,
  (select count(*) from v_harvest_alerts)::numeric as open_alerts,
  (select count(*) from metrc_plants where source_state in ('vegetative','flowering','onhold'))::numeric as live_records,
  (select string_agg(distinct verdict, ' · ') from v_harvest_lifecycle where verdict not in ('Complete','On track')) as what_is_wrong,
  (select min(harvest_date) from harvest_pulls where harvest_date >= current_date) as next_deadline
union all
select 'Post-harvest (dry, cure, trim)',
  (select count(*) from v_harvest_stage_map where stage like 'Drying%' and days_since_takedown > 14)::numeric,
  (select count(*) from v_harvest_stage_map where stage not in ('Finished','Archived'))::numeric,
  (select count(*) from v_harvest_stage_map where stage not in ('Finished','Archived'))::numeric,
  (select string_agg(distinct stage, ' · ') from v_harvest_stage_map where stage not in ('Finished','Archived')),
  (select min(harvest_start + 14) from v_harvest_stage_map where stage like 'Drying%')
union all
select 'Manufacturing',
  (select count(*) from v_turnaround_watch where turnaround_violation)::numeric,
  (select count(*) from v_turnaround_watch where no_policy_set)::numeric,
  (select count(*) from pipeline_runs where completed_at is null)::numeric,
  'Open production runs and turnaround policy gaps',
  null
union all
select 'Quality & compliance',
  (select count(*) from metrc_packages where lab_testing_state='TestFailed' and source_state in ('active','onhold'))::numeric,
  (select count(*) from v_custody_alerts)::numeric,
  (select count(*) from metrc_packages where lab_testing_state in ('SubmittedForTesting','TestingInProgress'))::numeric,
  'Failed testing on hand and custody red flags',
  null
union all
select 'Inventory & fulfilment',
  (select count(*) from v_inventory_aging where severity='critical')::numeric,
  (select count(*) from v_inventory_aging where severity is not null)::numeric,
  (select count(*) from v_inventory_locator)::numeric,
  'Aging stock and unconfirmed manifests',
  null
union all
select 'Human resources',
  (select count(*) from employees where terminated_on is null and primary_role_id is null)::numeric,
  0::numeric,
  (select count(*) from employees where terminated_on is null)::numeric,
  'Roster records missing a position',
  null;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Room Board (live)', 21, 'grid', 'room_board', 'v_room_board', 'Every room at a glance: the four flower rooms with live plants, strains and the next scheduled pull, and every drying, curing and trim room with what is in it, the weight on hand, the stage, and the day-14 dry deadline.'),
  ('Department Board', 22, 'users', 'department_board', 'v_department_board', 'Each department and what it owes right now: items needing action, open alerts, live records, what is wrong in plain words, and the next deadline.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select room, room_type, plants_now, weight_on_hand, next_event, days_until from v_room_board order by room_type, room limit 12;;
