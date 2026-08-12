drop view if exists v_metrc_strain_census;
create view v_metrc_strain_census as
with base as (
  select p.license, coalesce(p.strain, 'not recorded') as strain,
    count(*) filter (where p.source_state in ('vegetative','flowering','onhold'))::numeric as live_plants_now,
    count(*) filter (where p.source_state = 'vegetative')::numeric as vegetative_now,
    count(*) filter (where p.source_state = 'flowering')::numeric as flowering_now,
    count(*) filter (where p.source_state = 'onhold')::numeric as on_hold_now,
    count(*) filter (where p.source_state = 'inactive')::numeric as harvested_or_retired,
    count(*)::numeric as total_plants_all_time,
    count(distinct p.room) filter (where p.source_state in ('vegetative','flowering','onhold'))::numeric as rooms_now,
    string_agg(distinct p.room, ', ') filter (where p.source_state in ('vegetative','flowering','onhold')) as in_rooms,
    min(p.planted_on) as first_planted, max(p.planted_on) as last_planted
  from metrc_plants p group by p.license, coalesce(p.strain, 'not recorded')
)
select b.*,
  (select count(*) from metrc_harvests h where coalesce(h.raw->>'SourceStrainNames','') ilike '%' || b.strain || '%') as harvest_events,
  (select round((sum(coalesce((h.raw->>'TotalWetWeight')::numeric,0)) / 453.592)::numeric,1)
     from metrc_harvests h where coalesce(h.raw->>'SourceStrainNames','') ilike '%' || b.strain || '%') as lifetime_wet_lbs,
  (select round((sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)) / 453.592)::numeric,1)
     from metrc_harvests h where coalesce(h.raw->>'SourceStrainNames','') ilike '%' || b.strain || '%') as lifetime_packaged_lbs
from base b
order by b.live_plants_now desc, b.total_plants_all_time desc;
update nav_registry set description = 'Per strain: plants alive right now split by vegetative, flowering and on hold, plants harvested or retired, all-time total, which rooms hold it, first and last planting dates, harvest events, and lifetime wet and packaged pounds.'
where view_key = 'metrc_rpt_strain_census';

drop view if exists v_metrc_plant_census;
create view v_metrc_plant_census as
select p.license, p.room,
  case p.source_state when 'vegetative' then 'Vegetative' when 'flowering' then 'Flowering'
       when 'onhold' then 'On hold' else 'Harvested or retired' end as phase,
  count(*)::numeric as plants,
  count(distinct p.strain)::numeric as strains,
  (select string_agg(x.line, ' · ' order by x.n desc) from (
      select p2.strain || ' (' || count(*) || ')' as line, count(*) as n
      from metrc_plants p2
      where p2.license = p.license and p2.room = p.room and p2.source_state = p.source_state
      group by p2.strain) x) as strain_breakdown,
  min(p.planted_on) as oldest_planting, max(p.planted_on) as newest_planting,
  max(current_date - p.planted_on)::numeric as oldest_days_in_room
from metrc_plants p
where p.source_state in ('vegetative','flowering','onhold')
group by p.license, p.room, p.source_state
order by plants desc;
update nav_registry set description = 'Live plant counts by room and growth phase, with the exact strain breakdown in each room - which strains and how many of each - plus oldest and newest planting dates.'
where view_key = 'metrc_rpt_plant_census';

create or replace view v_plant_history as
select license, (date_trunc('month', planted_on))::date as month_date,
  to_char(planted_on, 'YYYY-MM') as month,
  count(*)::numeric as plants_planted,
  count(distinct strain)::numeric as strains_planted,
  string_agg(distinct strain, ', ') as strains,
  count(*) filter (where source_state in ('vegetative','flowering','onhold'))::numeric as still_alive,
  count(*) filter (where source_state = 'inactive')::numeric as harvested_or_retired
from metrc_plants where planted_on is not null
group by license, date_trunc('month', planted_on), to_char(planted_on, 'YYYY-MM')
order by month_date desc;
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Metrc', (select category_order from nav_registry where category='Metrc' limit 1),
  'Report: Planting History', 12, 'leafline', 'plant_history', 'v_plant_history',
  'Planting history by month: how many plants went in, how many strains, which strains, how many are still alive, and how many have been harvested or retired.',
  true, false, false
where not exists (select 1 from nav_registry where view_key = 'plant_history');
select strain, live_plants_now, flowering_now, harvested_or_retired, total_plants_all_time, lifetime_packaged_lbs from v_metrc_strain_census where live_plants_now > 0 limit 6;;
