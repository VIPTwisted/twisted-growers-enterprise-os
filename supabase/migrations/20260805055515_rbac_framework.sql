-- 0025: sitewide RBAC framework - permission catalog + role matrix + checker
-- Doctrine: if a user lacks a permission, the UI hides the control entirely.

create table if not exists permission_catalog (
  action text primary key,
  category text not null,
  label text not null,
  description text
);
alter table permission_catalog enable row level security;
create policy read_all on permission_catalog for select to authenticated using (true);
create policy exec_all on permission_catalog for all using (is_executive()) with check (is_executive());

create table if not exists app_roles (
  role text primary key,
  label text not null,
  rank integer not null,
  built_in boolean not null default true
);
alter table app_roles enable row level security;
create policy read_all on app_roles for select to authenticated using (true);
create policy exec_all on app_roles for all using (is_executive()) with check (is_executive());

create table if not exists role_permissions (
  role text not null references app_roles(role) on delete cascade,
  action text not null references permission_catalog(action) on delete cascade,
  allowed boolean not null default false,
  primary key (role, action)
);
alter table role_permissions enable row level security;
create policy read_all on role_permissions for select to authenticated using (true);
create policy exec_all on role_permissions for all using (is_executive()) with check (is_executive());
create trigger audit_role_permissions after insert or update or delete on role_permissions
  for each row execute function audit_row();

insert into app_roles (role, label, rank) values
('owner', 'Owner', 100), ('executive', 'Executive', 90), ('manager', 'Manager', 60),
('member', 'Member', 40), ('limited', 'Limited Member', 20), ('guest', 'Guest', 10)
on conflict (role) do nothing;

insert into permission_catalog (action, category, label, description) values
('manage_users', 'Manage', 'Manage Users', 'Add/remove users, change roles, manage invites'),
('manage_teams', 'Manage', 'Manage Teams', 'Create, edit, remove teams and their members'),
('edit_statuses', 'Manage', 'Edit Statuses', 'Create, edit, delete pipeline statuses'),
('manage_tags', 'Manage', 'Manage Tags', 'Create, edit, delete tags'),
('manage_custom_fields', 'Custom Fields', 'Manage Custom Fields', 'Create, edit, delete custom fields'),
('manage_custom_roles', 'Create & Delete', 'Custom Roles', 'Create and manage custom roles (admins only)'),
('create_views', 'Create & Delete', 'Create Views', 'Create and edit saved views on modules'),
('delete_items', 'Create & Delete', 'Delete Items', 'Delete records (own-only option comes with matrix editor)'),
('export_views', 'Export', 'Export Views', 'Export lists, views, whiteboards to CSV/PDF'),
('workspace_export', 'Workspace', 'Workspace Exporting', 'Full workspace exports'),
('workspace_import', 'Workspace', 'Workspace Importing', 'Import data from files and third-party apps'),
('manage_integrations', 'Workspace', 'Workspace Integrations', 'Set up Metrc, Sheets, QuickBooks, Monday connections'),
('workspace_permissions', 'Workspace', 'Workspace Permissions', 'Change workspace-level security (2FA, sharing, SSO)'),
('view_audit_logs', 'Workspace', 'View Audit Logs', 'View the append-only audit log'),
('personal_api_tokens', 'Workspace', 'Personal API Tokens', 'Use personal API tokens'),
('run_syncs', 'Workspace', 'Run Syncs', 'Press Metrc / sheet / accounting sync buttons'),
('view_others_time', 'Time', 'View Time Tracked by Others', 'See tracked time of other members'),
('approve_timesheets', 'Time', 'Approve Timesheets', 'Review and lock submitted timesheets'),
('view_payroll', 'Money', 'View Payroll & Rates', 'See per-employee rates, payroll forecasts, labor cost'),
('view_cash', 'Money', 'View Cash & Finance', 'See cash, invoices, AR, valuations, supplier costs'),
('manage_menu', 'Admin', 'Menu Manager', 'Show/hide menu items for all users'),
('manage_employee_files', 'Admin', 'Employee Files', 'View and edit CCC employee files, notes, documents'),
('edit_operations', 'Operations', 'Edit Operational Records', 'Edit harvests, inventory, schedules, purchases'),
('create_agents', 'AI', 'Create Super Agents', 'Create autonomous Brain agents (M5)'),
('create_skills', 'AI', 'Create AI Skills', 'Create reusable Brain skills (M5)'),
('brain_memory', 'AI', 'Import Brain Memory', 'Import standing context into Brain'),
('invite_members', 'Collaboration', 'Invite Members', 'Invite full members'),
('invite_guests', 'Collaboration', 'Invite Guests', 'Invite guests and limited members')
on conflict (action) do nothing;

insert into role_permissions (role, action, allowed)
select r.role, p.action,
  case
    when r.role in ('owner', 'executive') then true
    when r.role = 'manager' then p.action in
      ('manage_teams','edit_statuses','manage_tags','create_views','export_views','run_syncs',
       'view_others_time','approve_timesheets','edit_operations','invite_guests','delete_items')
    when r.role = 'member' then p.action in ('create_views','edit_operations','export_views')
    when r.role = 'limited' then p.action in ('create_views')
    else false
  end
from app_roles r cross join permission_catalog p
on conflict (role, action) do nothing;

create or replace function has_permission(p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select rp.allowed from app_users au
    join role_permissions rp on rp.role = au.role::text and rp.action = p_action
    where au.user_id = auth.uid()
  ), false);
$$;

insert into actions_register (title, priority, source, note, status) values
('Sitewide permission enforcement sweep: hide every unpermitted control', 'P0', 'owner_directive',
 'Owner 2026-08-05 (full spec supplied): RBAC framework now LIVE as data - permission_catalog (28 actions), app_roles (owner/executive/manager/member/limited/guest), role_permissions default matrix, has_permission() SQL checker. BUILD: (1) app-side can(action) hook hiding every button/menu/screen without permission; (2) admin matrix editor UI (per-action x per-role grid with search, custom roles); (3) map every nav item + control to an action; (4) migrate RLS from is_executive() to has_permission(); (5) 2FA/SSO/session-timeout/public-view auth = Supabase Auth settings - document + configure; block-public-sharing + private-by-default as configurations rows.', 'open')
on conflict do nothing;;
