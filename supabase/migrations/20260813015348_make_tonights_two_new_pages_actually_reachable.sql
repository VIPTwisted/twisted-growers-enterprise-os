-- Agent I, 12 Aug 2026. DBI-097.
--
-- Checked before telling the owner where to click, and found two of tonight's builds unreachable.
-- Both mine, and both the SAME mistake I had already made once tonight on v_owner_issue_queue:
-- built the page, added the menu row, never granted visibility. A page with zero rows in
-- nav_role_visibility renders for nobody. I fixed that once and did not generalise it, so it
-- happened twice more within the hour.
--
--   my_dashboard  - menu row exists, roles_can_see = 0. The drag-and-resize canvas the owner
--                   asked for twice would have opened to nothing.
--   tg_workspace  - NO MENU ROW AT ALL. The workspace agent said plainly its menu row needed
--                   module set and left it to me; I read that and did not do it. Committed,
--                   deployed, and unreachable.
--
-- Roles are copied from Command Center Dashboard rather than invented, so these two sit at
-- exactly the same visibility as the dashboard beside them and nothing is widened.
--
-- UNDO: delete the nav_role_visibility rows; set nav_registry.enabled = false for tg_workspace.

insert into nav_role_visibility (view_key, role, visible)
select 'my_dashboard', v.role, true
from nav_role_visibility v
where v.view_key = 'dept_dash_command' and v.visible
on conflict (view_key, role) do update set visible = true, updated_at = now();

insert into nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref, description,
   enabled, admin_only, surface, page_kind, date_policy, module, archetype)
select 'Workspace',
       (select min(category_order) from nav_registry where category = 'Workspace'),
       'TG Workspace', 0, 'grid', 'tg_workspace', 'tasks',
       'Tasks the way ClickUp does them, in your own platform. Spaces, lists, a board you drag '
       'cards across, task detail with comments, checklists, subtasks, attachments, time '
       'tracking and full history. Saved views per person. Every task can carry the figure that '
       'triggered it, frozen as it stood.',
       true, false, 'side', 'application', 'not_applicable', 'workspace', 'rules_editor'
where not exists (select 1 from nav_registry where view_key = 'tg_workspace');

insert into nav_role_visibility (view_key, role, visible)
select 'tg_workspace', v.role, true
from nav_role_visibility v
where v.view_key = 'dept_dash_command' and v.visible
on conflict (view_key, role) do update set visible = true, updated_at = now();;
