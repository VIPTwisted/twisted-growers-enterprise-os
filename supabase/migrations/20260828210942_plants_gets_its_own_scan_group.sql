-- PLANTS GET THEIR OWN SCAN GROUP, FOR THE SAME REASON PLANT BATCHES DID.
--
-- Owner instruction, 28 Aug 2026: "Run Metrc plants only ... If the job name for
-- plants is inside cultivation, do not fire harvests+batches with it - plants-only
-- job row, same rule as plantbatches."
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THE INSTRUCTION IS NECESSARY AND NOT MERELY TIDY.
--
-- tg_metrc_scan_now fires a GROUP, and `cultivation` is one row carrying three
-- endpoints: plants, harvests, plantbatches. Asking that group for plants would
-- re-pull all three - roughly twenty calls against a state regulator's API, and
-- harvests had already synced at 14:00 the same day. So there is no way to obey
-- "plants only" through the existing row; a row has to exist for it.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PLANTS IS THE ENDPOINT THAT DOES NOT FIT IN THE BUDGET, WHICH IS THE SECOND
-- AND BETTER REASON TO SPLIT IT.
--
-- Measured on production before writing this. The most recent plants run:
--
--     endpoint plants (delta) | 28 Aug 14:00 | status: PARTIAL
--     "Stopped at the soft deadline with 1054 rows written. Not a fault.
--      Cursor NOT advanced; the next run re-asks for this window."
--
-- metrc_plants holds 57,706 rows - by a wide margin the largest Metrc mirror on
-- this platform, and the only endpoint routinely hitting the soft deadline. That
-- deadline is a budget for the WHOLE GROUP. Bundled with harvests and plant
-- batches, plants is competing for time with two endpoints that finish in
-- seconds, and it is plants that gets cut off.
--
-- A plants-only group gives the endpoint the entire budget. That does not repair
-- the underlying problem - a mirror that cannot finish its own window inside one
-- run is a paging problem, not a scheduling one - but it stops the smallest
-- tables in the group from spending the largest table's time.
--
-- THE PARTIAL IS HANDLED CORRECTLY BY THE WORKER AND NOTHING HERE CHANGES THAT.
-- The cursor is deliberately not advanced on a partial, so the next run re-asks
-- for the same window and no record is skipped. A partial is a slow sync, not a
-- lost one. This row does not touch the cursor, the deadline, or the paging.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS ROW MAY NOT DO.
--
-- run_times is EMPTY. The owner set the cultivation cadence on 6 Aug ("morning
-- and end of day is all that is needed") and nothing here was asked to change
-- it. An empty run_times means the dispatcher never picks this group up on a
-- schedule - it fires only when asked for by name - so this adds an on-demand
-- capability and zero automatic API traffic. Plants continue to be scanned
-- twice daily by `cultivation` exactly as before.
--
-- The `cultivation` row is NOT edited. The postcondition below fails the
-- migration if it is not still byte-for-byte what it was.
--
-- MP281909 IS NOT CALLED. metrc_endpoint_capability records plants as denied for
-- the manufacturing licence - "It holds no live plants, so /plants/v2/* returns
-- 401 every time. 401 here means not your licence type, not bad credentials."
-- The worker reads that table, so this group will skip MP281909 by itself. No
-- licence is named here; the capability table stays the one place that decides.
insert into public.metrc_scan_schedule
  (job_name, endpoints, run_times, enabled, min_gap_minutes, description,
   display_name, what_it_pulls, why_it_matters, when_to_pull_now,
   calls_per_scan, sort_order)
values
  ('plants', 'plants', '{}', true, 15,
   'Plants only, on demand. Split out of the cultivation group so plants can be refreshed without re-pulling harvests and plant batches, and so the largest Metrc mirror gets the whole soft-deadline budget instead of sharing it. No run_times: this group fires only when asked for by name. Plants are still scanned twice daily by the cultivation group.',
   'Plants',
   'Live plants for the cultivation licence MC281714 - vegetative, flowering, on hold and inactive. The manufacturing licence MP281909 holds no plants and is skipped by metrc_endpoint_capability.',
   'metrc_plants is the largest Metrc mirror here at 57,706 rows and the one that routinely stops at the soft deadline with its cursor deliberately not advanced. Run alone it gets the full budget, so the window it could not finish inside the cultivation bundle can be closed.',
   'After a partial plants run, or when plant counts on screen disagree with Metrc and harvests do not need re-pulling.',
   4, 90)
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
      'The cultivation group was altered. endpoints=%, run_times=%, enabled=% - this migration may only ADD the plants row.',
      c.endpoints, c.run_times, c.enabled;
  end if;
end $$;

/* AND THE SALES GROUP MUST STILL BE OFF. It sits next to these rows and the same
   night's instruction asked for a Metrc sales run; metrc_endpoint_capability
   denies /sales/v2/receipts to both Twisted Growers licences because neither is
   retail, and the group was disabled on 6 Aug after 200 calls a day returned
   401. Nothing in this file goes near it, and this asserts that. */
do $$
begin
  if exists (select 1 from public.metrc_scan_schedule where job_name = 'sales' and enabled) then
    raise exception 'The sales group is enabled. Neither TG licence is retail; enabling it returns 401 on every call.';
  end if;
end $$;
