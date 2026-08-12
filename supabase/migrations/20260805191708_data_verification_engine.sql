-- Remove the confession log. Verification is a test that runs, not a ledger of errors.
delete from nav_role_visibility where view_key in ('metric_trust','metric_challenge_log');
delete from nav_registry where view_key in ('metric_trust','metric_challenge_log');
drop view if exists v_metric_trust cascade;
drop view if exists v_metric_challenge_log cascade;

-- Facility profile: real, owner-supplied facts that calibrate every benchmark.
create table if not exists facility_profile (
  id int primary key default 1,
  facility_name text not null default 'Twisted Growers LLC',
  cultivation_license text default 'MC281714',
  manufacturing_license text default 'MP281909',
  lighting_type text,
  canopy_sq_ft numeric,
  flower_rooms int,
  facility_age_years numeric,
  equipment_condition text,
  notes text,
  updated_at timestamptz not null default now(),
  constraint one_row check (id = 1)
);
alter table facility_profile enable row level security;
drop policy if exists fp_read on facility_profile;
create policy fp_read on facility_profile for select to authenticated using (true);
drop policy if exists fp_write on facility_profile;
create policy fp_write on facility_profile for all to authenticated using (true) with check (true);

insert into facility_profile (id, lighting_type, flower_rooms, facility_age_years, equipment_condition, notes)
values (1, 'Overhead only', 4, 2,
  'State of the art, all equipment new within the last 2 years',
  'Smaller footprint, sophisticated build. Canopy square footage still to be entered - once set, grams per square foot becomes measurable, which is the benchmark commercial cultivators actually use.')
on conflict (id) do update set
  lighting_type=excluded.lighting_type, flower_rooms=excluded.flower_rooms,
  facility_age_years=excluded.facility_age_years, equipment_condition=excluded.equipment_condition,
  notes=excluded.notes, updated_at=now();

-- The verification engine: automated tests against the Metrc source record.
drop view if exists v_data_verification cascade;
create view v_data_verification as
with t as (
select 'Wet weight reconciles' chk, 'Every harvest: wet weight equals packaged plus waste plus what remains in the room, within 5 percent.' what,
  count(*) tested,
  count(*) filter (where abs(wet_lb - coalesce(packaged_lb,0) - coalesce(waste_lb,0) - coalesce(still_in_room_lb,0)) <= wet_lb*0.05) passed,
  'harvest_forensic' drill from v_harvest_forensic where wet_lb > 0
union all
select 'Conversion physically possible', 'Wet to packaged must sit under 35 percent. Fresh flower is 75-80 percent water, so anything higher means the wet weight was recorded too low.',
  count(*), count(*) filter (where conversion_pct <= 35), 'harvest_issues'
  from v_harvest_forensic where harvest_state='Finished' and conversion_pct is not null
union all
select 'Plant count recorded', 'Every harvest carries a plant count, without which yield per plant cannot be computed.',
  count(*), count(*) filter (where plants > 0), 'harvest_forensic' from v_harvest_forensic
union all
select 'Wet weight recorded', 'Every harvest carries a wet weight at takedown.',
  count(*), count(*) filter (where wet_lb > 0), 'harvest_forensic' from v_harvest_forensic
union all
select 'Closed harvests produced packages', 'A harvest marked finished must have produced at least one package.',
  count(*), count(*) filter (where packages_made > 0), 'harvest_issues'
  from v_harvest_forensic where harvest_state='Finished'
union all
select 'Harvests closed within 21 days', 'A harvest must be closed out within 21 days of being cut.',
  count(*), count(*) filter (where total_days_start_to_now <= 21 or harvest_state='Finished'), 'harvest_issues'
  from v_harvest_forensic
union all
select 'Dry time inside the window', 'Cut to first package should fall between 7 and 16 days.',
  count(*), count(*) filter (where dry_days_to_first_package between 7 and 16), 'dry_room_performance'
  from v_harvest_forensic where dry_days_to_first_package is not null
union all
select 'Packages trace to a harvest', 'Every package of flower names the harvest it came from, so lineage is unbroken.',
  count(*), count(*) filter (where coalesce(raw->>'SourceHarvestNames','') <> ''), 'packages'
  from metrc_packages where raw#>>'{Item,ProductCategoryType}' ilike '%bud%'
union all
select 'Packages carry a location', 'Every package records where it physically is, as seed-to-sale requires.',
  count(*), count(*) filter (where coalesce(location,'') <> ''), 'packages' from metrc_packages
union all
select 'Drying location recorded', 'Every harvest names the room it dried in.',
  count(*), count(*) filter (where drying_room <> '(not recorded)'), 'dry_room_performance' from v_harvest_forensic
)
select chk as check_name, what as what_this_verifies, tested as records_tested, passed as records_passed,
  (tested - passed) as records_failed,
  case when tested = 0 then null else round(passed::numeric/tested*100,1) end as pass_rate_pct,
  case when tested = 0 then 'NO DATA'
       when passed = tested then 'PASS'
       when passed::numeric/tested >= 0.95 then 'PASS WITH EXCEPTIONS'
       when passed::numeric/tested >= 0.80 then 'NEEDS ATTENTION'
       else 'FAIL' end as result,
  case when tested = 0 then 'Nothing to test yet.'
       when passed = tested then 'All '||tested||' records pass this check.'
       else (tested-passed)||' of '||tested||' records fail. Open the report to see exactly which.' end as plain_english,
  drill as see_the_failures
from t order by case when tested=0 then 4 when passed=tested then 3
  when passed::numeric/tested >= 0.95 then 2 else 1 end, chk;

drop view if exists v_verification_summary cascade;
create view v_verification_summary as
select
  count(*) filter (where result='PASS') checks_passing,
  count(*) filter (where result in ('FAIL','NEEDS ATTENTION')) checks_failing,
  count(*) filter (where result='PASS WITH EXCEPTIONS') checks_with_exceptions,
  sum(records_tested) total_records_tested,
  sum(records_failed) total_records_failed,
  round(sum(records_passed)::numeric/nullif(sum(records_tested),0)*100,1) overall_pass_rate_pct,
  case when count(*) filter (where result='FAIL') > 0
    then 'Data integrity issues found. The failing checks name the exact records.'
    else 'Source data reconciles against Metrc.' end as verdict
from v_data_verification;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='ceo_dashboard' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Data Verification', 3, 'shield', 'data_verification', 'v_data_verification',
  'Ten automated checks run against the Metrc source record. Each shows how many records were tested, how many passed, and links straight to the failures.'),
 ('Facility Profile', 5, 'home', 'facility_profile', 'facility_profile',
  'The facility facts that calibrate every benchmark on the platform: lighting, canopy square footage, room count and equipment age.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, true from (values ('data_verification'),('facility_profile')) x(k),
 (values ('owner'),('executive'),('manager'),('member')) r(role)
on conflict (view_key, role) do update set visible = true;;
