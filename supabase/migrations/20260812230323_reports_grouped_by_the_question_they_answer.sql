-- Agent I, 12 Aug 2026. DBI-086.
-- OWNER APPROVED: "yes make reports look professional not a mile long list", after asking whether
-- reports are organised like QuickBooks and shown as neat tiles like DDC. They were not.
--
-- WHAT WAS WRONG, measured:
--   "All Data"                 250   <- 76% of everything, in a bucket that is a shrug
--   Inventory & Audit           25
--   Reports                     13   <- a group called Reports, inside Reports
--   Cultivation & Harvest       13
--   Metrc Reports               12
--   Inventory & Seed to Sale     5   <- second Inventory group
--   Compliance & Quality         5
--   Compliance                   2   <- second Compliance group
--   Accountability               2
--   Reference / Administration / Logistics & Transfers = 1 each
-- Two Inventory groups, two Compliance groups, three groups of one, and a catch-all. Exactly the
-- drift `hold_the_ddc_discipline` names: more than one definition of the same idea.
--
-- THE FINDING THAT ACTUALLY FIXES IT: 107 of the 250 are archetype='data_browser' - App Users,
-- Departments, Channels, Vendors, Widget Catalog, Configurations. THEY ARE NOT REPORTS. They are
-- a raw table viewer sitting in the Reports menu, and they are why the list reads a mile long.
-- Separating them removes 43% of the noise before a single report is renamed.
--
-- AND NO GUESSING WAS NEEDED. Every row already carries a clean `module` that matches its
-- category exactly. The classification existed all along and nothing used it - the same shape as
-- the room_alias defect, where the registry existed and the drill bypassed it.
--
-- GROUPS ARE NAMED FOR THE QUESTION, NOT THE TABLE - the QuickBooks principle the owner asked
-- for. "Money & Margin", not "finance". "Who owes you" beats "receivables_view".
--
-- The 11 Aug menu freeze permits RENAME, CONSOLIDATE, ADD and REMOVE of menu entries. This is a
-- consolidate. No page is disabled, no view_key changes, nothing is removed - every report is
-- still reachable, and any one of them can be found by the question it answers.
--
-- UNDO: audit_events holds the old report_group per row, exactly as it did for the 01:11 strip.

update nav_registry
   set report_group = case
     -- Raw table browsers are not reports. Own group, clearly labelled, last.
     when archetype = 'data_browser'  then 'Data Tables — raw'
     when module = 'command'          then 'Business Overview'
     when module = 'inventory'        then 'Inventory On Hand'
     when module = 'cultivation'      then 'Cultivation & Harvest'
     when module = 'manufacturing'    then 'Manufacturing & Production'
     when module = 'finance'          then 'Money & Margin'
     when module = 'metrc'            then 'Compliance & Metrc'
     when module = 'quality'          then 'Quality & Testing'
     when module = 'hr'               then 'People'
     when module = 'settings'         then 'Platform & IT'
     when module = 'workspace'        then 'Workspace & Tasks'
     -- No module: leave it exactly where it is rather than inventing a home for it.
     else report_group
   end
 where enabled
   and report_group is not null
   and (module is not null or archetype = 'data_browser');;
