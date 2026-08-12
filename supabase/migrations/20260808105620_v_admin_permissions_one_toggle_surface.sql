-- ONE PERMISSION SURFACE, QUICK TOGGLE. Owner, 8 Aug 2026: "Quick toggle on and off.
-- Permissions must be as detailed as QuickBooks. I do not want anything scattered."
--
-- WHAT WAS SCATTERED: access lived in five tables - app_roles (15), permission_catalog
-- (now 94), role_permissions, nav_role_visibility (5,602) and user_department_access
-- (0 rows, restricting nothing). An admin had to know all five to change one thing.
--
-- AND THE OLD 28 PERMISSIONS WERE ALL WORKSPACE-LEVEL - manage_users, export_views -
-- with nothing about the BUSINESS. Nobody could express "may see cultivation, not
-- money", which is precisely what QuickBooks does. Now 11 business areas x 6 verbs
-- (view, create, edit, delete, export, approve) = 66, plus the 28 workspace verbs.
--
-- TWO SYSTEMS, SEPARATE ON PURPOSE, BOTH REQUIRED:
--   permission = what you may DO   (role_permissions)
--   visibility = what you may SEE  (nav_role_visibility)
-- A role holding view_finance with no page grant gets a menu missing the page it
-- needs. This view shows both together so that cannot happen unnoticed.
-- UNDO: delete from permission_catalog where category like 'Area:%'.

create or replace view public.v_admin_permissions as
select r.role                                          as role_key,
       r.label                                         as role_label,
       r.rank,
       r.built_in,
       p.category                                      as permission_group,
       nullif(replace(p.category,'Area: ',''), p.category) as business_area,
       p.action                                        as permission_key,
       p.label                                         as permission_label,
       p.description,
       coalesce(rp.allowed, false)                     as granted,
       (rp.role is not null)                           as explicitly_set,
       (select count(*) from nav_role_visibility v
         where v.role = r.role and v.visible)          as pages_this_role_can_open,
       'Toggle with: insert into role_permissions(role,action,allowed) values (...) '
       'on conflict (role,action) do update set allowed = excluded.allowed. '
       'Built-in roles should be COPIED to a new role rather than edited.' as how_to_change,
       'PERMISSION is what you may DO. PAGE VISIBILITY is what you may SEE. Both are '
       'required - a role holding view_finance with no page grant gets a menu missing '
       'the page it needs.'                            as note
from app_roles r
cross join permission_catalog p
left join role_permissions rp on rp.role = r.role and rp.action = p.action;

comment on view public.v_admin_permissions is
  'The complete role-by-permission grid: every role x every permission, granted true '
  'or false, with that role''s page count beside it. 11 business areas x 6 verbs plus '
  '28 workspace permissions - the QuickBooks depth. Permission and page visibility '
  'are separate systems and BOTH must be set.';

-- Copying a role is how an admin makes their own without touching a built-in.
create or replace function public.f_copy_role(p_from text, p_new_key text, p_new_label text, p_rank int default null)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if exists (select 1 from app_roles where role = p_new_key) then
    return 'A role called ' || p_new_key || ' already exists. Pick another key.';
  end if;
  if not exists (select 1 from app_roles where role = p_from) then
    return 'No role called ' || p_from || ' to copy from.';
  end if;
  insert into app_roles (role, label, rank, built_in)
  select p_new_key, p_new_label, coalesce(p_rank, rank), false from app_roles where role = p_from;
  insert into role_permissions (role, action, allowed)
  select p_new_key, action, allowed from role_permissions where role = p_from;
  insert into nav_role_visibility (view_key, role, visible)
  select view_key, p_new_key, visible from nav_role_visibility where role = p_from;
  get diagnostics n = row_count;
  return 'Created ' || p_new_label || ' from ' || p_from || ' with '
    || (select count(*) from role_permissions where role = p_new_key)::text || ' permissions and '
    || n::text || ' page grants. Edit it freely - built-in roles stay untouched.';
end $$;

comment on function public.f_copy_role(text,text,text,int) is
  'Create a custom role by copying a built-in one, permissions AND page visibility '
  'together. Copying rather than editing a built-in means the defaults stay intact as '
  'a reference and an admin can always start again.';;
