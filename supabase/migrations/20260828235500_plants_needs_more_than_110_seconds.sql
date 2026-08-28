-- THE SOFT DEADLINE GOES 110s -> 180s, BECAUSE THE PLANTS DELTA NOW NEEDS 115.
--
-- Owner APPLY, 28 Aug 2026. This is a CONFIG ROW, not code: metrc-sync reads
-- metrc_sync_soft_deadline_ms once per request through numberSetting(). No deploy,
-- no edge-function pin, and reverting is one UPDATE.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY 110 WAS RIGHT AND IS NOW THE BINDING CONSTRAINT.
--
-- 110s was set on 8 Aug 2026 to stop a sync being killed mid-loop with its run
-- row left open at "running" forever. That reasoning is untouched and the value
-- is still a stop-and-close-yourself deadline, not a timeout.
--
-- What changed is what fits inside it. metrc-sync v22 (deployed today) replaced a
-- per-row upsert loop with batched writes. Measured, one hour apart, same window:
--
--     22:00:05  v21  1,054 rows  136s  partial
--     23:00:25  v22  3,244 rows  111s  partial   <- 3.1x the rows, 18% less time
--
-- The write is no longer the constraint; paging is. 3,244 rows is 163 pages at
-- Metrc's forced pageSize of 20, about 0.68s a page. Vegetative (1,054) and
-- flowering (2,190) now both complete - and together they consume the entire
-- 110-second budget, so `onhold` and `inactive` are still never reached and the
-- cursor is still correctly held at 2026-08-16T22:00:03Z.
--
-- The mirror has therefore been frozen at Metrc LastModified 17 Aug 15:06:17
-- for eleven days, and `inactive` - where harvested plants land - was last
-- written on 14 Aug while harvests kept arriving through 28 Aug.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY 180 AND NOT 240.
--
-- 240 was the first number proposed and it was not evidence-based. What the run
-- log actually proves is that runs have reached 136s, 140s and 165s and still
-- closed themselves cleanly. 180 is one modest step past the longest observed
-- survival rather than a guess in open water. The only datapoint above that is a
-- run that sat at 1,255s and never closed, so the true platform kill is somewhere
-- between - unmeasured, and not worth discovering with a bigger number than the
-- job needs.
--
-- 180 is enough on the measured numbers: ~115s clears vegetative and flowering,
-- `onhold` holds zero rows, and the `inactive` delta completed in 1-7s on 15 and
-- 16 Aug when the run still got that far. It leaves ~60s of headroom for a
-- sub-state that is now twelve days behind instead of two.
--
-- IF THIS IS STILL NOT ENOUGH the answer is NOT a bigger number. Each run
-- re-walks vegetative and flowering from page one, so a deadline can only ever
-- buy one run's worth of extra reach - it cannot compound. The real fix is a
-- resume cursor so successive runs continue instead of restarting, which is
-- v18's rolled-back intent and a worker change, not a config edit.
--
-- NOTHING ELSE MOVES. Not the page size (20 is Metrc's measured ceiling), not
-- PAGE_PAUSE_MS, not the cursor rule, not any schedule. One row, one number.
update public.configurations
   set value = jsonb_build_object(
         'ms', 180000,
         'why', 'Raised 110000 -> 180000 on 28 Aug 2026. A sync must still stop and close its own run before the platform kills it - that reason, measured on 8 Aug, is unchanged. The value moved because metrc-sync v22 batched its writes, so the plants delta now gets 3,244 rows through in 111s where v21 managed 1,054 in 136s; vegetative and flowering both complete and together eat the whole 110s, leaving onhold and inactive unreached and the cursor frozen at 16 Aug. 180000 is one step past the longest run observed to close itself cleanly (165s), not a guess: runs have survived 136s, 140s and 165s. Do NOT raise this further if a run still falls short - each run re-walks from page one, so a deadline cannot compound. That needs a resume cursor in the worker.',
         'set_by', 'agent-i')
 where key = 'metrc_sync_soft_deadline_ms';

/* The row must exist and must now read 180000, or the migration has silently done
   nothing and the next run would quietly behave exactly as before. */
do $$
declare v numeric;
begin
  select (value->>'ms')::numeric into v
    from public.configurations where key = 'metrc_sync_soft_deadline_ms';
  if v is distinct from 180000 then
    raise exception 'metrc_sync_soft_deadline_ms reads % after the update, expected 180000.', coalesce(v::text, 'NO ROW');
  end if;
end $$;

/* And nothing may have touched the page size, which is a MEASURED Metrc ceiling
   rather than a tunable. Raising it returns HTTP 400 on every plant sub-state. */
do $$
declare p numeric;
begin
  select (value->>'size')::numeric into p
    from public.configurations where key = 'metrc_page_size';
  if p is distinct from 20 then
    raise exception 'metrc_page_size reads %, expected 20 - Metrc rejects anything above 20 on the plants endpoints.', coalesce(p::text, 'NO ROW');
  end if;
end $$;
