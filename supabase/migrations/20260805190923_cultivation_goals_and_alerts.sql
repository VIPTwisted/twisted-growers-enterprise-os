create table if not exists cultivation_goals (
  id bigserial primary key,
  metric_key text not null unique,
  metric_label text not null,
  unit text not null,
  target numeric not null,
  direction text not null default 'at_least' check (direction in ('at_least','at_most','between')),
  target_max numeric,
  warn_within_pct numeric not null default 10,
  benchmark_note text,
  enabled boolean not null default true,
  alert_owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table cultivation_goals enable row level security;
drop policy if exists cg_read on cultivation_goals;
create policy cg_read on cultivation_goals for select to authenticated using (true);
drop policy if exists cg_write on cultivation_goals;
create policy cg_write on cultivation_goals for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')));

insert into cultivation_goals (metric_key, metric_label, unit, target, direction, target_max, warn_within_pct, benchmark_note, alert_owner) values
 ('conversion_pct','Wet to packaged conversion (closed harvests only)','percent',20,'between',28,10,
  'Fresh flower is 75-80 percent water, so a 4:1 to 5:1 wet:dry ratio is the commercial standard. Above 30 percent usually means the wet weight was recorded too low, not that yield was high.','Cultivation lead'),
 ('dry_days','Days from cut to first package','days',10,'between',14,20,
  'Ten to fourteen days is the standard dry window. Over-drying burns saleable weight permanently; under seven days locks in moisture and risks mould.','Post-harvest lead'),
 ('open_harvest_days','Days a harvest may stay open','days',21,'at_most',0,20,
  'A harvest left open cannot be sold or tested and corrupts every conversion figure in the business.','Cultivation lead'),
 ('grams_per_sqft','Grams of packaged flower per square foot of canopy','g/sq ft',50,'at_least',null,15,
  'Published commercial range: 35 g/sq ft for start-ups, 50-70 g/sq ft for established operations. This is the benchmark cultivators actually use because it is independent of plant density.','Cultivation lead'),
 ('waste_pct','Waste as a percent of wet weight','percent',12,'at_most',null,25,
  'Stem and fan leaf waste is normal and already inside cost per pound. Track it for trend, not for blame.','Post-harvest lead'),
 ('zero_packaged','Harvests closed with zero packages','count',0,'at_most',null,0,
  'Weight in with nothing out is the first thing an inspector asks about.','Compliance')
on conflict (metric_key) do nothing;

drop view if exists v_goal_status cascade;
create view v_goal_status as
with actuals as (
  select 'conversion_pct' k, (select round(sum(packaged_lb)/nullif(sum(wet_lb),0)*100,1)
      from v_harvest_forensic where harvest_state='Finished') v
  union all select 'dry_days', (select round(avg(dry_days_to_first_package),1) from v_harvest_forensic where dry_days_to_first_package is not null)
  union all select 'open_harvest_days', (select round(avg(total_days_start_to_now),1) from v_harvest_forensic where harvest_state like 'STILL OPEN%')
  union all select 'waste_pct', (select round(sum(waste_lb)/nullif(sum(wet_lb),0)*100,1) from v_harvest_forensic)
  union all select 'zero_packaged', (select count(*)::numeric from v_harvest_forensic where harvest_state='Finished' and packaged_lb=0)
  union all select 'grams_per_sqft', null
)
select g.metric_key, g.metric_label, g.unit, a.v as actual,
  g.target, g.target_max, g.direction, g.benchmark_note, g.alert_owner, g.enabled,
  case
    when a.v is null then 'NO DATA'
    when g.direction='at_least' and a.v >= g.target then 'ON TARGET'
    when g.direction='at_least' and a.v >= g.target*(1-g.warn_within_pct/100) then 'WARNING'
    when g.direction='at_least' then 'BELOW TARGET'
    when g.direction='at_most' and a.v <= g.target then 'ON TARGET'
    when g.direction='at_most' and a.v <= g.target*(1+g.warn_within_pct/100) then 'WARNING'
    when g.direction='at_most' then 'ABOVE TARGET'
    when g.direction='between' and a.v between g.target and g.target_max then 'ON TARGET'
    when g.direction='between' and a.v < g.target then 'BELOW TARGET'
    else 'ABOVE TARGET' end as status,
  case
    when a.v is null then 'This metric has no source data yet.'
    when g.direction='between' then 'Target is '||g.target||' to '||g.target_max||' '||g.unit||'. Actual is '||a.v||'.'
    when g.direction='at_least' then 'Target is at least '||g.target||' '||g.unit||'. Actual is '||a.v||'.'
    else 'Target is at most '||g.target||' '||g.unit||'. Actual is '||a.v||'.' end as plain_english
from cultivation_goals g left join actuals a on a.k = g.metric_key
where g.enabled order by
  case when a.v is null then 4
       when g.direction='between' and a.v between g.target and g.target_max then 3
       when g.direction='at_least' and a.v >= g.target then 3
       when g.direction='at_most' and a.v <= g.target then 3 else 1 end, g.metric_key;

drop view if exists v_goal_breaches cascade;
create view v_goal_breaches as
select * from v_goal_status where status in ('BELOW TARGET','ABOVE TARGET','WARNING');

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select max(category_order) from nav_registry where category='Cultivation'), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('GOALS & ALERTS — Set Targets', 85, 'target', 'cultivation_goals', 'cultivation_goals', 'Set the target for every cultivation metric. Editable: change the target, the acceptable range and who gets alerted. No code change needed - these are live rows.'),
 ('Goal Status — Live vs Target', 86, 'activity', 'goal_status', 'v_goal_status', 'Every goal against its live actual, with the status and what it means in plain English.'),
 ('ALERTS — Goals Being Missed', 87, 'bell', 'goal_breaches', 'v_goal_breaches', 'Only the goals currently being missed. Empty here means everything is on target.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, true from (values ('cultivation_goals'),('goal_status'),('goal_breaches')) x(k),
 (values ('owner'),('executive'),('manager'),('member')) r(role)
on conflict (view_key, role) do update set visible = true;;
