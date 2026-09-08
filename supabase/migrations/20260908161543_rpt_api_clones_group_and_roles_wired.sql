-- GROK-WHY: The three API-cloned Metrc reports landed with report_group null (outside_reports_menu) and zero roles (nobody can open). Copy Compliance & Metrc group + harvests role wiring so they are real pages. No Metrc write. No ledger rewrite. No GRANT to anon.

update public.nav_registry
   set report_group = 'Compliance & Metrc'
 where view_key in ('rpt-plants-flowering','rpt-plants-vegetative','rpt-plantings')
   and report_group is null;

insert into public.nav_role_visibility (view_key, role, visible)
select k.view_key, v.role, v.visible
  from (values
    ('rpt-plants-flowering'),
    ('rpt-plants-vegetative'),
    ('rpt-plantings')
  ) k(view_key)
  join public.nav_role_visibility v on v.view_key = 'rpt-harvests'
 where not exists (
   select 1 from public.nav_role_visibility x
    where x.view_key = k.view_key and x.role = v.role
 );

insert into public.page_permissions (view_key, role, can_view, can_export, can_edit, can_delete, can_approve, note)
select k.view_key, p.role, p.can_view, p.can_export, p.can_edit, p.can_delete, p.can_approve,
       'Copied from rpt-harvests so the cloned Flowering/Veg/Plantings reports can be opened.'
  from (values
    ('rpt-plants-flowering'),
    ('rpt-plants-vegetative'),
    ('rpt-plantings')
  ) k(view_key)
  join public.page_permissions p on p.view_key = 'rpt-harvests'
 where not exists (
   select 1 from public.page_permissions x
    where x.view_key = k.view_key and x.role = p.role
 );
