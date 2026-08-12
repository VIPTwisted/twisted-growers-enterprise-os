-- The strain-level views run a correlated ILIKE across every package, which is the
-- slow part. Materialize them and refresh on the sync schedule instead.
drop materialized view if exists mv_seed_to_sale;
create materialized view mv_seed_to_sale as select * from v_metrc_seed_to_sale;
create unique index if not exists mv_sts_strain on mv_seed_to_sale (strain);
drop materialized view if exists mv_harvest_yields;
create materialized view mv_harvest_yields as select * from v_metrc_harvest_yields;
create unique index if not exists mv_hy_name on mv_harvest_yields (harvest_name);
drop materialized view if exists mv_strain_census;
create materialized view mv_strain_census as select * from v_metrc_strain_census;
create unique index if not exists mv_sc_key on mv_strain_census (license, strain);

create or replace function tg_refresh_reports() returns text as $$
begin
  refresh materialized view concurrently mv_seed_to_sale;
  refresh materialized view concurrently mv_harvest_yields;
  refresh materialized view concurrently mv_strain_census;
  return 'refreshed';
exception when others then
  refresh materialized view mv_seed_to_sale;
  refresh materialized view mv_harvest_yields;
  refresh materialized view mv_strain_census;
  return 'refreshed (non-concurrent)';
end $$ language plpgsql;

select cron.unschedule(jobid) from cron.job where jobname = 'refresh-reports';
select cron.schedule('refresh-reports', '5,35 * * * *', $$ select tg_refresh_reports() $$);

-- Point the report pages at the fast copies
update nav_registry set table_ref = 'mv_seed_to_sale' where view_key = 'metrc_rpt_seed_to_sale';
update nav_registry set table_ref = 'mv_harvest_yields' where view_key = 'metrc_rpt_yields';
update nav_registry set table_ref = 'mv_strain_census' where view_key = 'metrc_rpt_strain_census';
grant select on mv_seed_to_sale, mv_harvest_yields, mv_strain_census to authenticated, anon;
select 'materialized' as done;;
