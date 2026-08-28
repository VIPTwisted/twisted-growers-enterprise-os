-- PLANT BATCHES GET THEIR OWN SCAN GROUP, SO THEY CAN BE PULLED ALONE.
--
-- Owner instruction, 28 Aug 2026: "run plantbatches only ... do not re-pull
-- plants and harvests tonight - those already synced today."
--
-- APPLIED to production 28 Aug 2026 as 20260828204326. This file was written
-- AFTER the fact: the migration was applied through the management API and the
-- file was not committed at the time, so production held a migration the repo
-- could not rebuild. That is the drift the migration-drift gate exists to catch,
-- and it is recorded here rather than quietly corrected.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY A NEW GROUP INSTEAD OF FIRING `cultivation`.
--
-- `cultivation` is one row carrying three endpoints - plants, harvests,
-- plantbatches - and tg_metrc_scan_now fires a GROUP, not an endpoint. Asking it
-- for plant batches would therefore also re-pull plants and harvests, both of
-- which had already synced at 14:00 that day. Twenty API calls against a state
-- regulator to refresh one table that needs one call is not a scan, it is noise.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS ROW IS NOT ALLOWED TO DO.
--
-- run_times is EMPTY, deliberately. The owner set the cultivation cadence on
-- 6 Aug ("morning and end of day is all that is needed") and nothing here was
-- asked to change it. An empty run_times means the dispatcher never picks this
-- group up on a schedule: it fires only when something asks for it by name. So
-- this row adds an on-demand capability and adds zero automatic API traffic.
--
-- The `cultivation` row is NOT edited. It still reads plants,harvests,
-- plantbatches and still runs at 10:00 and 18:00. The postcondition below fails
-- the migration if that is not still true when it finishes.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE STANDING DEFECT THIS ROW WORKS AROUND BUT DOES NOT FIX.
--
-- Measured before writing this: plantbatches last produced a run row on
-- 16 Aug 2026. For the twelve days after that, `plants` and `harvests` - the two
-- endpoints sharing this very group - ran twice every day, and plantbatches
-- produced nothing:
--
--     28 Aug   plants 1   harvests 1   plantbatches 0
--     27 Aug   plants 2   harvests 2   plantbatches 0
--     ...      every day from 17 Aug the same
--     16 Aug   plants 2   harvests 2   plantbatches 2
--
-- metrc_scan_schedule.cultivation.endpoints still reads 'plants,harvests,
-- plantbatches' and has not been edited since 6 Aug. metrc_endpoint_capability
-- still allows plantbatches for MC281714. So the dispatcher was still ASKING for
-- the endpoint and the worker stopped PRODUCING a run row for it - which points
-- at a metrc-sync deploy around 16/17 Aug, not at configuration.
--
-- This row does not repair that. It gives the endpoint a way to be run by hand
-- while the worker defect is still open, and the defect is written down here so
-- that adding the workaround does not bury it.
insert into public.metrc_scan_schedule
  (job_name, endpoints, run_times, enabled, min_gap_minutes, description,
   display_name, what_it_pulls, why_it_matters, when_to_pull_now,
   calls_per_scan, sort_order)
values
  ('plantbatches', 'plantbatches', '{}', true, 15,
   'Plant batches only, on demand. Split out of the cultivation group so plant batches can be refreshed without re-pulling plants and harvests. No run_times: this group fires only when asked for by name.',
   'Plant batches',
   'Immature plant batches from Metrc for the cultivation licence MC281714. The manufacturing licence MP281909 holds none and is skipped by metrc_endpoint_capability.',
   'metrc_plant_batches is the seed of the plant record: every plant traces back to the batch it came from, so a stale batch table breaks lineage for anything planted since it went stale.',
   'When metrc_plant_batches is older than the other Metrc tables, or after new clones are logged in Metrc.',
   1, 91)
on conflict (job_name) do nothing;

/* THE CULTIVATION GROUP MUST BE EXACTLY AS IT WAS. This migration adds a row and
   is permitted to do nothing else; if it has altered the owner-set cadence or
   the endpoint list, that is a silent change to production scanning and the
   migration must not be allowed to report success. */
do $$
declare c record;
begin
  select endpoints, run_times, enabled into c
    from public.metrc_scan_schedule where job_name = 'cultivation';

  if c.endpoints is distinct from 'plants,harvests,plantbatches'
     or c.run_times is distinct from array['10:00:00','18:00:00']::time[]
     or c.enabled is not true then
    raise exception
      'The cultivation group was altered. endpoints=%, run_times=%, enabled=% - this migration may only ADD the plantbatches row.',
      c.endpoints, c.run_times, c.enabled;
  end if;
end $$;
