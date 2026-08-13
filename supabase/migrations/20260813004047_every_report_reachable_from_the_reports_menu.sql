-- Agent I, 12 Aug 2026. DBI-090.
--
-- check:reportcontract I4 - "reports living as side-menu items" - reads 95 against a ratchet of
-- 93. §I4 of the mandate: a page that IS a report must be reachable from the Reports menu, not
-- only from the left rail, or nobody looking for a report can find it.
--
-- I am NOT raising the ratchet. I am emptying the class: every enabled report on the side surface
-- gets the report_group its own module already implies, using exactly the mapping applied earlier
-- tonight in reports_grouped_by_the_question_they_answer. The count goes to zero, which is a
-- ratchet FALLING - always allowed, never the forbidden direction.
--
-- One of the 95 is mine from 16:07 tonight (v_owner_issue_queue, "Issues Flagged by Agents"),
-- which the owner asked for and I added without a report group. The rest predate today and sat
-- just outside the baseline. Fixing the class rather than the two rows that broke the ratchet is
-- the difference between closing a cause and closing a symptom.
--
-- This also serves the owner's ask - "make reports look professional not a mile long list" -
-- because a report nobody can find from the Reports menu is worse than a long list.
--
-- UNDO: set report_group = null for these view_keys (audit_events holds the per-row before value).

update nav_registry
   set report_group = case
     when archetype = 'data_browser' then 'Data Tables — raw'
     when module = 'command'         then 'Business Overview'
     when module = 'inventory'       then 'Inventory On Hand'
     when module = 'cultivation'     then 'Cultivation & Harvest'
     when module = 'manufacturing'   then 'Manufacturing & Production'
     when module = 'finance'         then 'Money & Margin'
     when module = 'metrc'           then 'Compliance & Metrc'
     when module = 'quality'         then 'Quality & Testing'
     when module = 'hr'              then 'People'
     when module = 'settings'        then 'Platform & IT'
     when module = 'workspace'       then 'Workspace & Tasks'
     else 'Business Overview'   -- no module: it is still a report and must be findable
   end
 where enabled
   and page_kind = 'report'
   and surface = 'side'
   and report_group is null;;
