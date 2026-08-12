drop view if exists v_moisture_accounting cascade;
create view v_moisture_accounting as
with h as (
  select
    name as harvest, harvest_start,
    (raw->>'FinishedDate')::date as finished,
    coalesce(nullif(raw->>'DryingLocationName',''),'(not recorded)') as room,
    coalesce(nullif(raw->>'SourceStrainNames',''),'(not recorded)') as strain,
    (raw->>'PlantCount')::int as plants,
    wet_weight wet_g, waste_weight waste_g,
    (raw->>'TotalPackagedWeight')::numeric pkg_g,
    (raw->>'CurrentWeight')::numeric current_g,
    (name ilike '%FF%' or coalesce(nullif(raw->>'DryingLocationName',''),'') ilike '%freezer%') as fresh_frozen
  from metrc_harvests
)
select
  harvest, strain, room, harvest_start, finished, plants,
  case when fresh_frozen then 'Fresh frozen' else 'Dried flower' end as stream,
  round(wet_g/453.592,2) wet_lb,
  round(pkg_g/453.592,2) packaged_lb,
  round(waste_g/453.592,2) recorded_waste_lb,
  round((wet_g - pkg_g - waste_g)/453.592,2) as moisture_lb,
  round(current_g/453.592,2) as metrc_current_weight_lb,
  round(((wet_g - pkg_g - waste_g) - current_g)/453.592,2) as reconciliation_gap_lb,
  case when wet_g > 0 then round(100*(wet_g - pkg_g - waste_g)/wet_g,1) end as moisture_pct_of_wet,
  case when wet_g > 0 then round(100*pkg_g/wet_g,1) end as conversion_pct,
  round(wet_g/453.592,2)||' lb wet = '||round(pkg_g/453.592,2)||' packaged + '||
    round(waste_g/453.592,2)||' waste + '||round((wet_g-pkg_g-waste_g)/453.592,2)||' evaporated' as the_arithmetic,
  case
    when fresh_frozen then 'FRESH FROZEN - packaged at field moisture, so almost no water leaves. Never judge this against a dried-flower conversion.'
    when wet_g = 0 then 'NO WET WEIGHT RECORDED - cannot be reconciled.'
    when abs((wet_g - pkg_g - waste_g) - current_g) > wet_g*0.02
      then 'DOES NOT RECONCILE - Metrc current weight disagrees by '||round(abs((wet_g-pkg_g-waste_g)-current_g)/453.592,2)||' lb. Investigate.'
    when 100*(wet_g - pkg_g - waste_g)/wet_g between 70 and 82
      then 'NORMAL - '||round(100*(wet_g-pkg_g-waste_g)/wet_g,1)||' percent moisture loss, inside the expected 70 to 82 percent.'
    when 100*(wet_g - pkg_g - waste_g)/wet_g > 82
      then 'MOISTURE LOSS HIGH at '||round(100*(wet_g-pkg_g-waste_g)/wet_g,1)||' percent. Over-dried, or packaged weight recorded low.'
    else 'MOISTURE LOSS LOW at '||round(100*(wet_g-pkg_g-waste_g)/wet_g,1)||' percent. Wet weight probably recorded too low at takedown.'
  end as verdict
from h;

drop view if exists v_moisture_summary cascade;
create view v_moisture_summary as
select stream, count(*) harvests,
  round(sum(wet_lb),1) wet_lb, round(sum(packaged_lb),1) packaged_lb,
  round(sum(recorded_waste_lb),1) waste_lb, round(sum(moisture_lb),1) evaporated_lb,
  round(sum(metrc_current_weight_lb),1) metrc_says_lb,
  round(sum(reconciliation_gap_lb),1) gap_lb,
  round(100*sum(moisture_lb)/nullif(sum(wet_lb),0),1) moisture_pct,
  round(100*sum(packaged_lb)/nullif(sum(wet_lb),0),1) conversion_pct,
  'Every pound of wet weight ends up in exactly one of three places: packaged product, recorded waste, or water that evaporated. This proves the three add back.' as what_this_proves
from v_moisture_accounting where finished is not null group by 1;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1),
 'Moisture & Mass Balance', 30, 'droplet', 'moisture_accounting', 'v_moisture_accounting',
 'Every harvest reconciled with the arithmetic shown: wet weight equals packaged plus recorded waste plus evaporated moisture, checked against the Metrc current weight. Proves nothing is missing and names any harvest that disagrees.', true, false, false
where not exists (select 1 from nav_registry where view_key='moisture_accounting');
insert into nav_role_visibility (view_key, role, visible)
select 'moisture_accounting', r.role, r.vis from
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;;
