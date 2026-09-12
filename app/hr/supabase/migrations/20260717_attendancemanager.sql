-- AttendanceManager.jsx — real-data verification pass (2026-07-17).
--
-- RESULT: the screen's entire backend ALREADY EXISTS and was verified against
-- the live HR brain (zsmdejhgdyyaakqsjhmk) via anon PostgREST probes:
--   reads:  scope_shifts(p_node_ids)                                  -> live, returns []
--           get_all_time_entries(p_node_ids, p_date_from, p_date_to)  -> live, returns []
--           get_attendance_overview(p_node_ids)                       -> live, returns []
--   writes: add_attendance_incident(...)  -> live (rejected null-node probe, nothing inserted)
--           log_attendance_event(...)     -> live (accepted a probe row, cleaned up below)
-- No new tables and no new RPCs are needed for this screen. The client-side
-- fixes (derived live locations, persisted checkbox/shift flags) reuse the
-- existing RPCs above.
--
-- The ONLY action here: remove the single verification probe row that
-- log_attendance_event inserted while proving the RPC exists (person_id null,
-- notes 'probe'). Anon REST cannot delete it (RLS on, no anon policy), so the
-- supervisor's migration run removes it. Idempotent — safe to re-run.

do $$
begin
  if to_regclass('public.attendance_events') is not null then
    delete from public.attendance_events
     where id = 'ea99da70-56dc-4545-911b-893678d3eee1';
  end if;
end $$;

-- NOTE for supervisor (out of this screen's scope, flagging only):
-- log_attendance_event accepted p_person_id = null from the anon role. Consider
-- adding a null-person guard inside that function's live definition (its exact
-- signature is not in this repo's migrations, so it is not redefined here to
-- avoid creating an ambiguous overload).
