-- Applied prod 20260905182319. Timeout retry 20260905182307 deleted (same SQL).
-- Staff was enabled with no nav_role_visibility, so report-contract counted
-- FAILS nobody-can-open 115 vs ratchet 114. Copy Budz's Assistant roles.

insert into public.nav_role_visibility (view_key, role, visible)
select 'os_staff', v.role, v.visible
  from public.nav_role_visibility v
 where v.view_key = 'budz'
   and not exists (
     select 1 from public.nav_role_visibility x
      where x.view_key = 'os_staff' and x.role = v.role
   );
