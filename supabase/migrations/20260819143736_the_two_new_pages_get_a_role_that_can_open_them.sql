/* ═══════════════════════════════════════════════════════════════════════════
   THE GATE CAUGHT ME PUTTING TWO PAGES ON A MENU NOBODY COULD OPEN.

   Adding nav rows for schedule_adherence and plant_census pushed
   report-contract's 'report_nobody_can_open' from 114 to 116: neither had a
   single page_permissions row, so they counted as delivered work that renders
   for no role. That is exactly the failure the ratchet exists to stop, and it
   stopped mine. Both are cultivation operating pages, so they take the same six
   roles that already hold can_view on the rest of the platform.

   The other 114 are PRE-EXISTING debt, not touched here — every cultivation
   dashboard and register is in that number. That is a real finding and it stays
   visible in the ratchet rather than being blessed away.
   ═══════════════════════════════════════════════════════════════════════════ */
insert into page_permissions (role, view_key, can_view, can_edit, can_approve, can_export, can_delete, note)
select r.role, v.view_key, true, false, false, true, false,
       'Cultivation operating page, mounted on the menu 19 Aug 2026. Export allowed, edit not — these two pages read Metrc''s mirror and write nothing.'
from (values ('owner'),('executive'),('admin'),('manager'),('hr'),('cfo')) as r(role)
cross join (values ('schedule_adherence'),('plant_census')) as v(view_key)
where not exists (
  select 1 from page_permissions p where p.role = r.role and p.view_key = v.view_key
);

/* Two ratchets earned a tighter number today and both are recorded, because a
   ratchet left loose after the work that tightened it protects nothing. */
update ratchet_baseline set baseline = 0
 where metric_key = 'report_outside_reports_menu' and baseline > 0;
update ratchet_baseline set baseline = 102
 where metric_key = 'report_date_range_defect' and baseline > 102;