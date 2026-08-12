create table if not exists harvest_alert_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text unique not null,
  label text not null,
  threshold numeric not null,
  unit text default 'days',
  severity text not null default 'watch' check (severity in ('watch','elevated','critical')),
  active boolean default true,
  note text
);
alter table harvest_alert_rules enable row level security;
drop policy if exists har_read on harvest_alert_rules;
drop policy if exists har_write on harvest_alert_rules;
create policy har_read on harvest_alert_rules for select to authenticated using (true);
create policy har_write on harvest_alert_rules for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));
insert into harvest_alert_rules (rule_key, label, threshold, unit, severity, note) values
  ('dry_target_days', 'Dry target reached', 10, 'days', 'watch', 'From the 8-Week Harvest Calendar: dry target day 10.'),
  ('dry_max_days', 'Dry window exceeded', 14, 'days', 'critical', 'From the calendar: dry day 14 is the outer limit.'),
  ('weights_due_days', 'Weights not reported', 3, 'days', 'elevated', 'Days after takedown before reported weights are considered late.'),
  ('cure_max_days', 'Curing beyond plan', 30, 'days', 'elevated', 'Harvest still unfinished this long after takedown.'),
  ('waste_pct_max', 'Waste percentage above limit', 10, 'percent', 'critical', 'Waste share of wet weight that triggers review.'),
  ('yield_pct_min', 'Yield percentage below floor', 12, 'percent', 'elevated', 'Packaged share of wet weight considered low - owner may tune.'),
  ('pull_overdue_days', 'Scheduled pull missed', 2, 'days', 'critical', 'Days past a planned pull date with no harvest recorded.'),
  ('lab_pending_days', 'Laboratory result outstanding', 7, 'days', 'elevated', 'Days a harvest sits awaiting a laboratory result.')
on conflict (rule_key) do nothing;

create or replace view v_harvest_alerts as
with r as (select rule_key, label, threshold, severity from harvest_alert_rules where active)
select m.license, m.harvest, m.room, 'Drying' as area,
  case when m.days_since_takedown > (select threshold from r where rule_key='dry_max_days')
       then (select severity from r where rule_key='dry_max_days')
       else (select severity from r where rule_key='dry_target_days') end as severity,
  case when m.days_since_takedown > (select threshold from r where rule_key='dry_max_days')
       then 'Dry window exceeded - day ' || m.days_since_takedown || ' of a ' || (select threshold from r where rule_key='dry_max_days')::int || '-day limit'
       else 'Dry target reached - day ' || m.days_since_takedown end as alert,
  m.days_since_takedown::numeric as value, m.stage, m.harvest_start as reference_date
from v_harvest_stage_map m
where m.stage like 'Drying%' and m.days_since_takedown >= (select threshold from r where rule_key='dry_target_days')
union all
select m.license, m.harvest, m.room, 'Weight reporting',
  (select severity from r where rule_key='weights_due_days'),
  'No weights reported ' || m.days_since_takedown || ' days after takedown',
  m.days_since_takedown::numeric, m.stage, m.harvest_start
from v_harvest_stage_map m
where coalesce(m.wet_weight,0) = 0 and m.days_since_takedown >= (select threshold from r where rule_key='weights_due_days')
union all
select m.license, m.harvest, m.room, 'Cycle',
  (select severity from r where rule_key='cure_max_days'),
  'Still unfinished ' || m.days_since_takedown || ' days after takedown - the next pull for this room is at risk',
  m.days_since_takedown::numeric, m.stage, m.harvest_start
from v_harvest_stage_map m
where m.stage not in ('Finished','Archived') and m.days_since_takedown > (select threshold from r where rule_key='cure_max_days')
union all
select m.license, m.harvest, m.room, 'Waste',
  (select severity from r where rule_key='waste_pct_max'),
  'Waste at ' || m.waste_pct || ' percent of wet weight - above the ' || (select threshold from r where rule_key='waste_pct_max')::int || ' percent limit',
  m.waste_pct, m.stage, m.harvest_start
from v_harvest_stage_map m
where m.waste_pct > (select threshold from r where rule_key='waste_pct_max')
union all
select m.license, m.harvest, m.room, 'Yield',
  (select severity from r where rule_key='yield_pct_min'),
  'Yield at ' || m.yield_pct || ' percent of wet weight - below the ' || (select threshold from r where rule_key='yield_pct_min')::int || ' percent floor',
  m.yield_pct, m.stage, m.harvest_start
from v_harvest_stage_map m
where coalesce(m.packaged_weight,0) > 0 and m.yield_pct < (select threshold from r where rule_key='yield_pct_min')
union all
select 'MC281714' as license, 'Pull #' || p.pull_no as harvest, p.flower_room as room, 'Planner',
  (select severity from r where rule_key='pull_overdue_days'),
  'Planned pull on ' || p.harvest_date || ' has no harvest recorded - ' || (current_date - p.harvest_date) || ' days late',
  (current_date - p.harvest_date)::numeric, 'Planned', p.harvest_date
from harvest_pulls p
where p.harvest_date < current_date - ((select threshold from r where rule_key='pull_overdue_days')::int)
  and not exists (
    select 1 from metrc_harvests h
    where h.harvest_start between p.harvest_date - 3 and p.harvest_date + 7
  );

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, v.adm, false
from (values
  ('Harvest Alerts', 28, 'bell', 'harvest_alerts', 'v_harvest_alerts', 'Live alerts against the harvest plan: drying past target or limit, weights not reported, curing beyond plan, waste above limit, yield below floor, and planned pulls that never happened.', false),
  ('Harvest Alert Rules', 29, 'shield', 'harvest_alert_rules', 'harvest_alert_rules', 'The thresholds behind every harvest alert - dry target and limit, reporting deadline, waste ceiling, yield floor, overdue pull tolerance. Change a number here and the alerts change immediately.', true)
) v(l, io, ic, vk, tr, d, adm)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select severity, area, count(*) n from v_harvest_alerts group by 1,2 order by n desc;;
