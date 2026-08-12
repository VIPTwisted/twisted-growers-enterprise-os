-- Agent I, 12 Aug 2026. DBI-059.
-- One permanent watcher and two flagged findings. Nothing corrected: owner decides.

-- 1. PERMANENT GUARD against the duplicate-tag class. The 9 cross-licence duplicates were found
--    by accident tonight because a tile happened to be registered. This contract makes the class
--    itself impossible to reach the owner unseen: rows must equal distinct tags, forever.
insert into tile_drill_contract
 (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance)
values
('inv.stock_packages.one_row_per_tag','Inventory','Stock detail — one row per physical package',
 'select count(*)::numeric from v_stock_packages',
 'select count(distinct package_tag)::numeric from v_stock_packages',
 0,
 'Zero by definition. A package is one physical thing; two rows for one tag is always a defect, '
 'never a rounding.')
on conflict (contract_key) do update set
  tile_sql = excluded.tile_sql, drill_sql = excluded.drill_sql, registered_at = now();

-- 2. FINDING: room_department is empty, so no room has an owner-set department.
insert into correction_proposal
 (raised_by, domain, target_object, severity, the_issue, the_evidence, what_needs_fixing,
  the_proposal, why_this_is_the_fix, how_it_never_repeats,
  rows_affected, pounds_affected, dollars_affected, risk_if_wrong, reversible, status)
values
('Agent I','Command','room_department','elevated',

 'The table that assigns a department to a room, room_department, contains ZERO rows. Every '
 'department label anywhere in the OS is therefore inferred from the licence code — MC281714 '
 'becomes CULTIVATION, MP281909 becomes MANUFACTURING — and any room holding no packages gets '
 'no label at all.',

 'Measured 12 Aug 2026: select count(*) from room_department returns 0. The department string in '
 'v_onhand_by_room_stage comes from a CASE on p.license, confirmed in the query plan. Because '
 'F1 through F4 hold plants and not packages, they fall out of that path entirely and render as '
 '"F1 — UNASSIGNED" on the Command Center room tiles, in a platform whose J7 rule requires every '
 'room to be shown department-qualified.',

 'Rooms need a real department assignment that does not depend on whether packages happen to be '
 'sitting in them today. A flower room between cycles is still a Cultivation room.',

 'Owner populates room_department for all 19 known rooms, joined into v_room_board_complete with '
 'the licence-derived value kept only as a fallback and labelled as inferred where it is used. '
 'F1–F4, Veg A and Mother are Cultivation on the face of it, but the assignment is the owner''s '
 'to make, not mine — several rooms serve two functions and I will not guess.',

 'Licence is not department. One licence can span several departments and a department can span '
 'two licences, so inferring one from the other was always going to fail at the edges — it just '
 'failed silently until a room with no stock appeared on a tile.',

 'Add a contract asserting every room in v_room_board_complete resolves to a non-inferred '
 'department, so the next unlabelled room fires a finding instead of printing UNASSIGNED to the '
 'owner. Same pattern as room_alias: the mapping lives in a table every surface joins, never in '
 'a CASE statement inside one view where the next agent cannot see it.',

 19, null, null,

 'Very low — it is a label, and it is reversible by editing the row. The risk of leaving it is '
 'that UNASSIGNED appears on the Command Center indefinitely and every department rollup silently '
 'omits rooms that hold no packages.',

 true,'proposed');

-- 3. FINDING: two real rooms whose names read as one duplicated room. Presentation, not data.
insert into correction_proposal
 (raised_by, domain, target_object, severity, the_issue, the_evidence, what_needs_fixing,
  the_proposal, why_this_is_the_fix, how_it_never_repeats,
  rows_affected, pounds_affected, dollars_affected, risk_if_wrong, reversible, status)
values
('Agent I','Inventory','v_room_board_complete','watch',

 'Two rooms render adjacent with names a reader cannot tell apart: "Pre Trim Storage Room" '
 'holding 197.4 lb and "Pre-Trim Storage" holding 443.7 lb. On the page they read as one room '
 'listed twice with two different weights, which is the single most alarming thing a stock '
 'board can show.',

 'I suspected a duplicate and CHECKED BEFORE FILING — it is not one. Metrc holds them as two '
 'distinct locations under two distinct licences: "Pre-Trim Storage" is MP281909 with 40 '
 'packages, "Pre Trim Storage Room" is MC281714 with 24 packages. Both names are Metrc''s own, '
 'not ours. So the data is right and the DISPLAY is wrong.',

 'The room board shows bare room names with no licence, so two legitimately separate rooms in '
 'two licences are indistinguishable. Nothing about the weights is wrong.',

 'Show licence alongside room wherever two rooms share a confusable name — the room_qualified '
 'pattern already exists for department and should carry licence in this case. Do NOT merge them '
 'and do NOT rename anything: Metrc is the legal record and these are its names.',

 'The platform''s rule is that a room is shown qualified, never bare, precisely so two things '
 'with similar names cannot be mistaken for each other. That rule was applied to department and '
 'not to licence, and this is where the omission surfaces.',

 'Extend the qualification rule to licence in room_alias, so any future pair of confusable room '
 'names inherits it automatically rather than being noticed by eye. Record in the root cause '
 'ledger that a near-duplicate NAME is a presentation defect and must not be "fixed" by merging '
 'rows — I nearly filed this as a data duplicate and it would have been a false finding.',

 64, null, null,

 'Low. Adding a licence to a label changes no figure. The risk of leaving it is that the owner or '
 'an auditor reads a duplicated room and loses confidence in a stock board that is actually '
 'correct.',

 true,'proposed');;
