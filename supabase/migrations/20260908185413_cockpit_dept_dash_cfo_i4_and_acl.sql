-- GROK-WHY: 20260908184759 inserted dept_dash_cfo as surface=side page_kind=report with no report_group and no page_permissions.
-- I4: a report on the side rail must also be in the Reports dropdown (report_group set).
-- report_nobody_can_open: copy ACL from dept_dash_command (owner/exec/cfo/admin).
-- Top bar Finance dropdown unchanged (v_dept_dash_cfo still surface=finance). Cycle 56. No ledger rewrite.

update public.nav_registry
   set report_group = 'Finance',
       updated_at = now()
 where view_key = 'dept_dash_cfo'
   and (report_group is null or report_group = '');

insert into public.page_permissions (role, view_key, can_view, can_edit, can_approve, can_export, can_delete, note)
select p.role, 'dept_dash_cfo', p.can_view, p.can_edit, p.can_approve, p.can_export, p.can_delete,
       'copied from dept_dash_command for Finance cockpit pin'
  from public.page_permissions p
 where p.view_key = 'dept_dash_command'
   and not exists (
     select 1 from public.page_permissions x
      where x.view_key = 'dept_dash_cfo' and x.role = p.role
   );
