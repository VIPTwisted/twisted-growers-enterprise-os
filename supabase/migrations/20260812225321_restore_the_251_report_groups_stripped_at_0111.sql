-- Agent I, 12 Aug 2026. DBI-085.
-- OWNER APPROVED, verbatim: "yes restore reports okay to my items".
--
-- WHAT HAPPENED. At 2026-08-12 01:11:20.330887 UTC, ONE batch of 251 nav_registry UPDATEs
-- stripped report_group from 'All Data' to NULL. No migration file did it; the audit trigger is
-- the only record. App.jsx puts a page in the Reports dropdown when surface='reports' OR
-- report_group is set, so 232 of those 251 - the ones that are page_kind='report' on
-- surface='side' - LEFT THE REPORTS DROPDOWN AND LANDED IN THE LEFT RAIL. 93 + 234 = 327, which
-- is exactly the number check:reportcontract has been failing on all day.
--
-- This is the literal form of the owner's "FIX SO I CAN SEE".
--
-- SAFE BECAUSE IT IS EXACT, NOT INFERRED. The audit rows carry the OLD value, so nothing is
-- guessed. Verified immediately before running: all 251 are still NULL and zero have been
-- changed by anything since, so this restores and never overwrites newer intent.
--
-- Agent W found it and correctly did NOT revert it - nav_registry is a frozen surface and it
-- could not tell whether stripping a junk catch-all group was deliberate. That was the right
-- call; the owner has now said it was not deliberate.
--
-- UNDO: set report_group = null for the same 251 ids.

update nav_registry n
   set report_group = a.old_group
  from (
    select (entity_id)::uuid as id, old_value->>'report_group' as old_group
    from audit_events
    where entity = 'nav_registry'
      and at = '2026-08-12 01:11:20.330887+00'
      and old_value->>'report_group' is not null
      and new_value->>'report_group' is null
  ) a
 where n.id = a.id
   and n.report_group is null;;
