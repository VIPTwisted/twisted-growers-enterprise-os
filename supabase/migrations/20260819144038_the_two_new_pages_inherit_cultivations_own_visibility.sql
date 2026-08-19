/* ═══════════════════════════════════════════════════════════════════════════
   WHO CAN SEE THEM — TAKEN FROM CULTIVATION, NOT INVENTED.

   The first attempt at this wrote page_permissions rows, which was the wrong
   table: v_page_wiring.roles_who_can_see counts nav_role_visibility rows where
   visible, and both new pages had none. The ratchet stayed at 116 and was right
   to. (The page_permissions rows are still correct and stay — they govern edit,
   export and approve, which nav_role_visibility does not.)

   Rather than decide a visibility policy for two pages, both inherit the EXACT
   role/visible pairs already carried by dept_dash_cultivation. They sit in the
   same category, they read the same rooms, and a page that invents its own
   access rule is how a menu ends up with 24 different answers to one question.
   ═══════════════════════════════════════════════════════════════════════════ */
insert into nav_role_visibility (role, view_key, visible)
select src.role, tgt.view_key, src.visible
from nav_role_visibility src
cross join (values ('schedule_adherence'), ('plant_census')) as tgt(view_key)
where src.view_key = 'dept_dash_cultivation'
  and not exists (
    select 1 from nav_role_visibility x
    where x.role = src.role and x.view_key = tgt.view_key
  );