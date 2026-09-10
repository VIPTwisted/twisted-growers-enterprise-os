-- Owner rulings 10 Sep 2026 17:49 ET.
-- 1. 11 active staff with no department: leave unassigned. HR assigns. They may rotate.
-- 2. Carroll, Hank and Hendrix, Allison J: no longer with us. OS already inactive.
--    Leave the Metrc Cannabis Agent Registration alone. We do not POST to Metrc.
-- 3. departments.name stays Cheap Pre-Rolls (payroll/seed joins). Display is Economy.
-- 4. Wave 2 unpaid break is 13:30-14:00 (floor file). Card loader had drifted to 13:00-13:30.
-- 5. Facility Map is the post-login landing. Every signed-in badge. Written into
--    nav_registry + page_permissions + nav_role_visibility so it is not an unlisted door.

insert into public.nav_registry (
  category, category_order, label, item_order, icon, view_key,
  description, enabled, admin_only, sync_enabled, surface, page_kind, module, archetype
)
select
  'Facility Map', 0, 'Facility Map', 0, 'map', 'facility_twin',
  'Post-login landing and Home. Every signed-in badge. Owner ruling 10 Sep 2026 17:49 ET.',
  true, false, false, 'side', 'application', 'command', null
where not exists (select 1 from public.nav_registry where view_key = 'facility_twin');

insert into public.nav_role_visibility (view_key, role, visible)
select 'facility_twin', r.role, true
from (values
  ('owner'),('executive'),('planner'),('dept_head'),('staff'),('readonly'),
  ('cfo'),('manager'),('assistant_manager'),('hr'),('admin'),('employee'),
  ('member'),('guest'),('limited')
) r(role)
on conflict (view_key, role) do update set visible = true;

insert into public.page_permissions (role, view_key, can_view, note)
select r.role, 'facility_twin', true,
  'Owner ruling 10 Sep 2026 17:49 ET: every signed-in badge. It is the landing page and Home.'
from (values
  ('owner'),('executive'),('planner'),('dept_head'),('staff'),('readonly'),
  ('cfo'),('manager'),('assistant_manager'),('hr'),('admin'),('employee'),
  ('member'),('guest'),('limited')
) r(role)
on conflict (role, view_key) do update
  set can_view = true,
      note = excluded.note,
      updated_at = now();

insert into public.configurations (key, value)
select 'owner_rulings_20260910_1749et',
  jsonb_build_object(
    'at', '2026-09-10T17:49:00-04:00',
    'by', 'owner',
    'rulings', jsonb_build_array(
      jsonb_build_object('key','hr.no_department','ruling','Leave unassigned. HR assigns. They may rotate. Do not invent a department.'),
      jsonb_build_object('key','hr.leavers_live_badge','ruling','Carroll, Hank and Hendrix, Allison J no longer with us. OS inactive. Leave Metrc badge. Do not POST to Metrc.'),
      jsonb_build_object('key','naming.economy_prerolls','ruling','Keep departments.name Cheap Pre-Rolls for payroll joins. Certified label is Economy Pre-Rolls via alias.'),
      jsonb_build_object('key','block.wave2_time','ruling','Wave 2 is 13:30-14:00 as the floor file. Card loader had drifted to 13:00-13:30. Floor file wins.'),
      jsonb_build_object('key','block.map_permissions','ruling','Every signed-in badge. Facility Map is the post-login landing and Home.')
    )
  )
where not exists (select 1 from public.configurations where key = 'owner_rulings_20260910_1749et');

update public.deployment_check set
  status = 'PASS',
  value = '13:30-14:00',
  detail = 'Floor file (facility.ts BREAK_WAVES) said 13:30-14:00. The card loader (facility-api.ts WAVES) had drifted to 13:00-13:30, so a first visit showed the wrong unpaid-break window. Owner 10 Sep 2026 17:49 ET: the floor file is the clock. Loader now matches. localStorage that still holds 13:00-13:30 is rewritten on read.',
  signed_by = 'owner',
  signed_at = now(),
  sign_note = 'Wave 2 = 13:30-14:00. Floor file is SoR. Drifted loader aligned. Why: two constants disagreed; the map is a clone of the floor file, so the file wins.'
where check_key = 'block.wave2_time';

update public.deployment_check set
  status = 'PASS',
  value = 'every signed-in badge',
  detail = 'facility_twin is the post-login landing and Home. It was missing from nav_registry and page_permissions, so any signed-in session could open it only because nothing blocked it — the door was unlisted, not denied. Owner 10 Sep 2026 17:49 ET: that is the intended door. Written down: nav_registry row, page_permissions can_view=true, nav_role_visibility visible=true for every OS role. Not owner/exec only.',
  signed_by = 'owner',
  signed_at = now(),
  sign_note = 'Every signed-in badge. It is Home. Why: landing page after login; hiding it from staff would strand them. Unlisted-but-open was a hole, not a policy — now it is a policy.'
where check_key = 'block.map_permissions';

update public.deployment_check set
  expected = 'unassigned allowed; HR assigns',
  why = 'Owner 10 Sep 2026 17:49 ET: leave unassigned. HR assigns. They may rotate. Null department is the correct state until HR writes one.'
where check_key = 'hr.no_department';

update public.deployment_check set
  expected = 'OS inactive; Metrc badge left Active',
  why = 'Owner 10 Sep 2026 17:49 ET: they left. OS inactive. Leave the Metrc registration. We do not POST to Metrc. CCC offboards the badge.'
where check_key = 'hr.leavers_live_badge';

update public.deployment_check set
  expected = 'display Economy; row may stay Cheap',
  why = 'Owner 10 Sep 2026 17:49 ET: do not rename departments.name. Payroll and seed join on Cheap Pre-Rolls. Certified label is Economy Pre-Rolls via the facility alias.'
where check_key = 'naming.economy_prerolls';
