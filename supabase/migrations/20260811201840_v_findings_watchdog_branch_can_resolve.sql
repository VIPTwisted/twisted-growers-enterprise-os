-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-005 (reviewers V, X, W).
--
-- THE DEFECT. v_findings is the unified findings spine that tg_route_findings() reads to decide
-- what needs an owner. Its watchdog_findings branch hardcodes:
--     NULL::timestamp with time zone AS resolved_at
-- so NO watchdog finding can ever be represented as resolved. The routing layer selects
-- "where resolved_at is null", which means every watchdog finding ever raised is permanently
-- unresolvable - it routes forever, whether or not the underlying problem was fixed days ago.
--
-- HOW IT SURFACED. watchdog_findings had no resolution column at all until today. Four findings
-- raised 7-9 Aug (anon-cannot-execute, exposure-not-double-counted, packages-mirror-vs-metrc,
-- packages-unique-on-tag) were still sitting open tonight even though all four checks now agree -
-- two of them had been fixed for four days. Adding cleared_at gave findings a lifecycle; this
-- migration makes the spine able to see it.
--
-- WHY IT MATTERS BEYOND TIDINESS. The owner's rule is that all discrepancies must be addressed.
-- A queue that cannot record "addressed" cannot tell a live problem from a dead one, so the real
-- ones drown. 1,581 findings currently read as open across the spine. Until now none of the
-- watchdog ones could ever leave that number, no matter what anyone did.
--
-- THIS IS NOT RELAXING A GUARD. No threshold moves, no tolerance widens, no check is disabled.
-- A finding leaves the open set only when the condition that raised it stops holding, re-tested
-- from source twice a day. The row itself is never deleted - all data is kept forever.
--
-- REBUILT BY ANCHORED SUBSTITUTION, NOT BY RETYPING. Transcribing a 7,486-character view by hand
-- is how a branch gets silently dropped. The anchor was confirmed to occur exactly once before
-- this ran, and the block refuses to proceed if it is not found.
--
-- UNDO: re-run this block with old and new swapped.

do $do$
declare v_def text; v_old text; v_new text; v_hits int;
begin
  v_def := pg_get_viewdef('public.v_findings'::regclass);

  v_old := 'NULL::timestamp with time zone AS timestamptz';
  v_new := 'w.cleared_at';

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_hits <> 1 then
    raise exception
      'Refusing to rebuild v_findings: expected exactly 1 occurrence of the watchdog resolved_at '
      'anchor, found %. The view has changed shape since this migration was written. Re-read it '
      'and re-anchor rather than guessing.', v_hits;
  end if;

  execute 'create or replace view public.v_findings as ' || replace(v_def, v_old, v_new);
end
$do$;

comment on view public.v_findings is
 'The unified findings spine: agent_findings, watchdog_findings, custody flags and the rest, in '
 'one shape. tg_route_findings() reads it to decide what needs an owner. The watchdog branch '
 'reports resolved_at from watchdog_findings.cleared_at - before 11 Aug 2026 it was hardcoded '
 'NULL, so watchdog findings could never leave the open queue and four fixed problems routed for '
 'four days after they were fixed.';;
