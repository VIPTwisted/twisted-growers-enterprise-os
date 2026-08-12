-- Agent I, 12 Aug 2026. DBI-081.
-- The widget canvas is built and mounted; without a menu entry it is unreachable.
-- Owner: "SIMILAR TO TRADING PLATFORM i CAN MOVE AND RESIZE EACH AS I WANT" and, on the current
-- Command Center, "its totally out of order from what i want to se". This is the answer to the
-- second: he arranges it himself rather than anyone guessing his order.
--
-- The 11 Aug freeze on the side menu permits RENAME, CONSOLIDATE, ADD and REMOVE of menu
-- ENTRIES. This is an add; nothing existing is touched.
--
-- V2: the category is "Command Center", not "Command", so the category_order subquery returned
-- null against a NOT NULL column. Measured rather than guessed the second time.
--
-- date_policy = not_applicable: a personal layout is not a period. Same reasoning that removed
-- the date filter from Keys & Connections, where a key set in July read as "not set".

insert into nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref, description,
   enabled, admin_only, surface, page_kind, date_policy, module, archetype)
select 'Command Center', 0, 'My Dashboard', 0, 'grid', 'my_dashboard', 'v_my_layout',
       'Your own dashboard. Drag any panel to move it, drag its corner to resize, and it stays '
       'where you put it next time you sign in. Add widgets from the catalogue of 50, keep '
       'several dashboards for different jobs — Finance at year end, Cultivation in season — and '
       'switch between them. Reset to the house layout any time.',
       true, false, 'side', 'application', 'not_applicable', 'command', 'rules_editor'
where not exists (select 1 from nav_registry where view_key = 'my_dashboard');

update nav_registry set enabled = true, item_order = 0, category = 'Command Center'
 where view_key = 'my_dashboard';;
