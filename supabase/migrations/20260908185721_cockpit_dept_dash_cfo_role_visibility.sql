-- GROK-WHY: page_permissions existed on dept_dash_cfo but v_report_standard.roles_who_can_see reads nav_role_visibility. Copy Command's visibility. I4 already set. Cycle 56.

insert into public.nav_role_visibility (role, view_key, visible)
select v.role, 'dept_dash_cfo', v.visible
  from public.nav_role_visibility v
 where v.view_key = 'dept_dash_command'
   and not exists (
     select 1 from public.nav_role_visibility x
      where x.view_key = 'dept_dash_cfo' and x.role = v.role
   );
