-- Agent: I, 11 Aug 2026. Two changes, both found by measurement rather than review.
--
-- 1. BUG IN MY OWN DRIVER, caught before it bit. tg_metrc_backfill_next() checked for an
--    in-flight run with `endpoint like 'plants%'` - hardcoded to the only endpoint the
--    queue held at the time. The moment a packages window is queued, a packages run in
--    flight would NOT block the next tick, two syncs would overlap, and both would fight
--    the same 110s deadline. Now it checks the endpoint of the window it is about to fire.
--
-- 2. PACKAGES ARE WORSE THAN PLANTS. Measured today:
--       metrc_packages holds 4,384 packages.
--       metrc_rpt_package_transfers names 15,496 distinct tags on manifests.
--       14,124 of those tags have NO package record at all.
--       Mirror coverage: 8.9%.
--    That is the binding constraint on owner ruling 4A: attribution can reach only
--    9,940 of 24,900 ledger tags (39.9%), and the 60.1% unattributed is overwhelmingly
--    tags whose packages were never mirrored - not a gap in the rule, a gap in the copy.
--    Same cause as plants: /packages/v2/inactive runs behind three other paths against a
--    110s deadline that only checks between pages.
--
-- Seeds monthly windows for packages. Monthly rather than fortnightly because packages
-- carry a delta cursor already at 2026-08-11 and the historical volume is lower per month
-- than plants; if a window overruns it closes as 'partial' and the row records it, which
-- is the point of doing this in a queue rather than a script.
--
-- UNDO: delete from metrc_backfill_window where endpoint='packages';
--       and restore the previous function body from
--       20260811154220_metrc_backfill_window_driver.sql.

create or replace function public.tg_metrc_backfill_next()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare w metrc_backfill_window; req bigint; inflight int;
begin
  -- Close out the window the last run belonged to, using that run's own outcome.
  update metrc_backfill_window b
     set status = case when r.status in ('ok','partial') then 'done' else 'failed' end,
         records = r.records, finished_at = r.finished_at,
         note = coalesce(r.error, 'closed from run '||r.id)
    from metrc_sync_runs r
   where b.sync_run_id = r.id and b.status = 'running' and r.finished_at is not null;

  select * into w from metrc_backfill_window
   where status = 'pending' and attempts < 3
   order by win_start limit 1;

  if not found then
    return 'nothing pending - backfill complete or exhausted';
  end if;

  -- Never overlap, and check the endpoint we are ACTUALLY about to fire. The previous
  -- version hardcoded 'plants%' and would have let a packages run overlap silently.
  select count(*) into inflight from metrc_sync_runs
   where status = 'running' and endpoint like w.endpoint||'%'
     and started_at > now() - interval '10 minutes';
  if inflight > 0 then
    return 'waiting - a '||w.endpoint||' sync is still in flight';
  end if;

  select tg_call_function(
    'metrc-sync?endpoints='||w.endpoint||'&license='||w.licence
    ||'&winStart='||to_char(w.win_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ||'&winEnd='  ||to_char(w.win_end   at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ) into req;

  update metrc_backfill_window
     set status='running', attempted_at=now(), attempts=attempts+1,
         sync_run_id=(select max(id) from metrc_sync_runs where endpoint like w.endpoint||'%')
   where id=w.id;

  return format('fired %s %s %s to %s (request %s)', w.endpoint, w.licence,
                w.win_start::date, w.win_end::date, req);
end $function$;

-- Packages, both licences, monthly from the first harvest on record.
insert into metrc_backfill_window (endpoint, licence, win_start, win_end)
select 'packages', l.lic, d, d + interval '1 month'
from generate_series(timestamptz '2024-05-01', timestamptz '2026-08-01', interval '1 month') d
cross join (values ('MC281714'),('MP281909')) as l(lic)
on conflict do nothing;;
