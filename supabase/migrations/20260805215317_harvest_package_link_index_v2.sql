drop materialized view if exists mv_harvest_pkg_rollup cascade;
drop materialized view if exists mv_package_harvest cascade;

create materialized view mv_package_harvest as
select distinct
  btrim(hn) as harvest_name,
  p.id as package_id,
  p.quantity,
  p.packaged_on,
  p.raw->>'LabTestingState' as lab_state,
  p.raw#>>'{Item,ProductCategoryName}' as category
from metrc_packages p
cross join lateral unnest(string_to_array(coalesce(p.raw->>'SourceHarvestNames',''), ',')) as hn
where btrim(hn) <> '';
create index mv_ph_name on mv_package_harvest (harvest_name);

create materialized view mv_harvest_pkg_rollup as
select
  harvest_name,
  min(packaged_on)::date as first_package_on,
  max(packaged_on)::date as last_package_on,
  count(distinct package_id) as packages_made,
  count(distinct package_id) filter (where lab_state = 'TestFailed') as failed_packages,
  count(distinct package_id) filter (where lab_state = 'TestPassed') as passed_packages,
  count(distinct package_id) filter (where lab_state = 'NotSubmitted') as untested_packages,
  round(sum(quantity) filter (where category ilike '%bud%') / 453.592, 2) as bud_lb,
  round(sum(quantity) filter (where category ilike '%shake%' or category ilike '%trim%') / 453.592, 2) as shake_trim_lb,
  string_agg(distinct category, ', ') as categories_made
from mv_package_harvest
group by 1;
create unique index mv_hpr_name on mv_harvest_pkg_rollup (harvest_name);

create or replace function tg_refresh_harvest_links()
returns void language plpgsql security definer set search_path=public as $$
begin
  refresh materialized view mv_package_harvest;
  refresh materialized view concurrently mv_harvest_pkg_rollup;
end $$;

grant select on mv_package_harvest, mv_harvest_pkg_rollup to authenticated, anon, tg_desktop_reader;;
