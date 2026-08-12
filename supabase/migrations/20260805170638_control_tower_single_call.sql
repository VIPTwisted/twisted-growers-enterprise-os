-- One call instead of dozens: every Control Tower number in a single round trip,
-- refreshed on the sync cadence.
create materialized view if not exists mv_tower_counts as
select
  (select count(*) from metrc_packages where source_state in ('active','onhold')) as packages_active,
  (select count(*) from metrc_packages) as packages_all,
  (select count(*) from metrc_plants where source_state in ('vegetative','flowering','onhold')) as plants_live,
  (select count(*) from metrc_plants) as plants_all,
  (select count(*) from metrc_harvests) as harvests,
  (select count(*) from metrc_transfers) as transfers,
  (select count(*) from metrc_plant_batches) as plant_batches,
  (select count(*) from harvest_schedule) as harvest_events,
  (select count(*) from employees where terminated_on is null) as employees_active,
  (select count(*) from actions_register where status = 'open') as actions_open,
  (select count(*) from actions_register where status = 'open' and priority = 'P0') as actions_p0,
  (select count(*) from golive_items where status <> 'done') as golive_open,
  (select count(*) from v_custody_alerts) as custody_flags,
  (select count(*) from v_harvest_alerts) as harvest_alerts,
  (select count(*) from v_inventory_aging where severity = 'critical') as aging_critical,
  (select count(*) from metrc_packages where lab_testing_state = 'TestFailed' and source_state in ('active','onhold')) as failed_testing_on_hand,
  (select count(*) from metrc_transfers where direction='outgoing' and raw->>'ReceivedDateTime' is null and created_on < current_date - 3) as manifests_unconfirmed,
  (select max(started_at) from metrc_sync_runs) as last_sync,
  now() as computed_at;
create unique index if not exists mv_tower_one on mv_tower_counts ((1));
grant select on mv_tower_counts to authenticated, anon;
create or replace function tg_refresh_tower() returns void as $$
begin refresh materialized view concurrently mv_tower_counts;
exception when others then refresh materialized view mv_tower_counts; end $$ language plpgsql;
select cron.unschedule(jobid) from cron.job where jobname = 'refresh-tower';
select cron.schedule('refresh-tower', '*/5 * * * *', $$ select tg_refresh_tower() $$);
select * from mv_tower_counts;;
