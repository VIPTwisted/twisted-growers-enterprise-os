-- Agent I, 12 Aug 2026. DBI-087. Correcting my own DBI-086 before the owner saw it.
--
-- DBI-086 correctly identified that all 250 "All Data" entries are archetype='data_browser' -
-- raw table viewers, not reports - and moved them out of the report groups. Right diagnosis.
-- But it put all 250 into ONE group called "Data Tables — raw", which is the same mile-long list
-- with an honest label on it. The owner asked for "not a mile long list"; 250 in a row is a mile
-- long whatever it is called.
--
-- Split by module. Ten groups instead of one, each named for the part of the business whose
-- tables it holds, and each prefixed "Tables ·" so no one confuses a raw table viewer with a
-- report. The prefix sorts them together and below the real reports.
--
-- WHAT THE MENU NOW HOLDS: roughly 80 genuine reports in business-question groups, and 250 raw
-- table viewers clearly marked as such in ten module groups. Nothing is hidden, nothing is
-- disabled, every page is still reachable - the difference is that a report is now findable by
-- the question it answers, and a raw table is visibly a raw table.
--
-- UNDO: audit_events holds the previous report_group per row.

update nav_registry
   set report_group = case module
     when 'workspace'     then 'Tables · Workspace'
     when 'metrc'         then 'Tables · Metrc'
     when 'cultivation'   then 'Tables · Cultivation'
     when 'command'       then 'Tables · Command'
     when 'finance'       then 'Tables · Finance'
     when 'settings'      then 'Tables · Platform'
     when 'inventory'     then 'Tables · Inventory'
     when 'manufacturing' then 'Tables · Manufacturing'
     when 'quality'       then 'Tables · Quality'
     when 'hr'            then 'Tables · People'
     else 'Tables · Other'
   end
 where enabled and report_group = 'Data Tables — raw';

-- Fold the leftover duplicate groups the first pass could not reach, because those rows carry no
-- module. Two Compliance groups and two Inventory groups were the original complaint.
update nav_registry set report_group = 'Compliance & Metrc'
 where enabled and report_group in ('Compliance', 'Compliance & Quality');

update nav_registry set report_group = 'Inventory On Hand'
 where enabled and report_group in ('Inventory & Audit', 'Inventory & Seed to Sale');

update nav_registry set report_group = 'Business Overview'
 where enabled and report_group in ('Accountability', 'Reference', 'Administration', 'Reports');

update nav_registry set report_group = 'Compliance & Metrc'
 where enabled and report_group in ('Metrc Reports', 'Logistics & Transfers');;
