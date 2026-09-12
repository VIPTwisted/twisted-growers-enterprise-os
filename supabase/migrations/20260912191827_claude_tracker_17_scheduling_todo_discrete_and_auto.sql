-- GROK-WHY: Already applied in production as 20260912191827 claude_tracker_17_scheduling_todo_discrete_and_auto.
-- Another desk ran this. Filed here so migration-drift can pass and the Bots paid key can ship on Sync.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- Owner 12 Sep 2026: "add what we have to do to the deployment tracker".
-- The two composite rows (training_matrix summary, owner.sched_rulings) become discrete, owned,
-- closeable rows; the data ones re-measure themselves hourly and close on their own.

update public.deployment_check set active = false, detail = coalesce(detail,'') || ' | Retired 12 Sep: split into hr.* and owner.* rows below.'
 where check_key in ('sched.training_matrix', 'owner.sched_rulings');

insert into public.deployment_check (check_key, section, title, why, kind, severity, expected, status, value, detail, last_run_at, active, sort_order)
values
 -- HR data work (auto-measured, closes itself)
 ('hr.assign_departments', '17 Scheduling & zones', 'Every active employee has a primary department', 'A person with no department cannot be drafted anywhere — the drafter reads employee_department_skill, which is keyed by department. 11 of 27 active had none on 12 Sep. HR assigns in Settings › Employees (or gives Claude the list to load until the page exists). Re-measured hourly; closes at 0.', 'auto', 'NO-GO', '0 active without a department', 'FAIL', null, null, null, true, 156),
 ('hr.verify_seeded_skills', '17 Scheduling & zones', 'HR verifies the 17 seeded training rows (trained_on, trained_by)', 'The matrix was seeded ''trained'' from each primary department so drafting could start; nothing is verified until HR sets verified_by. Until then a draft is built on an assumption, not a record. Re-measured hourly; closes at 0 unverified.', 'auto', 'NO-GO', '0 seeded rows unverified', 'FAIL', null, null, null, true, 157),
 ('hr.trained_in_departments', '17 Scheduling & zones', 'Trained-in and in-training departments recorded — floaters appear', 'Owner ruling: floater = trained or in training in 2+ departments. 0 floaters in data means the second departments have not been entered, not that nobody floats. HR adds a row per extra department per person (level in_training / trained / can_lead, re-cert date where one applies). Re-measured hourly.', 'auto', 'WATCH', '≥ 1 floater; every department has ≥ 1 trained-in backup', 'WARN', null, null, null, true, 158),
 ('sched.first_real_draft', '17 Scheduling & zones', 'First real weekly draft posted (week of 21 Sep) by a sign-off role', 'Claude drafts on request (f_draft_schedule) or the button does once the page lands; CEO/CFO/HR review the reasons on each cell and post. Preconditions: hr.assign_departments, hr.verify_seeded_skills. Re-measured hourly: PASS once a draft covering ≥ 21 Sep is posted.', 'auto', 'NO-GO', '1 posted draft covering the week of 21 Sep', 'PENDING', null, null, null, true, 159),
 -- owner rulings, one each
 ('owner.shift_start_time', '17 Scheduling & zones', 'Owner confirms the shift: 08:00–16:30, 30 min unpaid meal, Wave 1 12:00 / Wave 2 13:30', 'The two waves are the owner''s 10 Sep ruling; the 08:00 start is Claude''s recommendation. Change in Settings › Shift model (shift_templates, break_windows).', 'owner', 'OWNER', 'confirmed or changed', 'PENDING', null, null, null, true, 160),
 ('owner.zone_department_map', '17 Scheduling & zones', 'Owner confirms three zone→department mappings the blueprint left open', 'Production Room → Extraction (blueprint group Extraction; Flower/Infused Pre-Rolls may own infusion). Grind → Packaging (blueprint Packaging · Flower; the pre-roll departments may own grinding). Economy Pre-Rolls as its own zone for the 3 Cheap Pre-Rolls staff, same room as Pre-Rolls. Change in Settings › Zones.', 'owner', 'OWNER', 'confirmed or moved', 'PENDING', null, null, null, true, 161),
 ('owner.weekend_cover', '17 Scheduling & zones', 'Owner rules on weekend flower-room cover', 'Plants are watered seven days. The recommendation is 1 head Sat and Sun; every cultivation person is at 40 h by Friday, so it is overtime for whoever takes it — the drafter flags it every week. Options: accept OT, a part-time weekend hire, rotate a floater once trained, or set the weekend requirement to 0.', 'owner', 'OWNER', 'a ruling', 'PENDING', null, null, null, true, 162),
 ('owner.settings_edit_roles', '17 Scheduling & zones', 'Owner confirms who may EDIT scheduling settings (today: owner, executive, admin, hr, cfo)', 'Posting a schedule is owner / executive / cfo / hr (scheduling_policy.signoff_roles, your 12 Sep ruling). Editing rooms, zones, staffing, shift model, policy and the training matrix uses the existing HR gate f_can_decide_hr(), which also admits admin. Say if admin should be out, or if editing should be narrower than posting.', 'owner', 'OWNER', 'confirmed', 'PENDING', null, null, null, true, 163),
 -- other lanes
 ('sched.bot_drafter', '17 Scheduling & zones', 'The AI layer drafts through f_schedule_candidates / f_draft_schedule', 'Owner: "ai can auto draft all schedules with zones and human signs off". The rule-based drafter is live; the AI layer (Top G / bots — Grok''s lane) may rank differently or explain better, but it places people only through f_schedule_candidates, sets agent_name on the draft, and never posts. Weekly / semi-weekly / monthly is the policy''s draft_cadence.', 'manual', 'WATCH', 'bot drafts land as schedule_drafts with agent_name; 0 direct writes to employee_schedules', 'PENDING', null, null, null, true, 164),
 ('sched.staff_pages', '17 Scheduling & zones', 'My schedule / availability / swap / call-out pages read the new zone, skills and policy', 'myschedule.jsx, staffforms.jsx and the swap flow exist and read employee_schedules by free-text zone; they need zone_id, the policy switches (swap_needs_signoff, claim_with_ot_needs_signoff) and f_cover_candidates. Mobile-first. Lane: Grok / HR module.', 'manual', 'WATCH', 'pages read zone_id + policy; call-out → cover list', 'PENDING', null, null, null, true, 165),
 ('sched.repo_matches_production', '17 Scheduling & zones', 'PR #235 merged so the repo carries what is live', 'Migrations claude_scheduling_01..04 are live; the drift gate cannot see database functions, so the only record in the repo is tools/repairs/claude-scheduling-0*.sql plus the blueprint snapshot test. Merge when reviewed.', 'manual', 'WATCH', 'PR #235 merged', 'PENDING', null, 'https://github.com/VIPTwisted/twisted-growers-enterprise-os/pull/235', null, true, 166)
on conflict (check_key) do update set section = excluded.section, title = excluded.title, why = excluded.why, kind = excluded.kind, severity = excluded.severity,
  expected = excluded.expected, sort_order = excluded.sort_order, active = true;

-- onboarding row becomes auto too
update public.deployment_check set kind = 'auto' where check_key = 'sched.onboarding_tracking';

-- the hourly measurement
create or replace function public.f_deployment_checks_run_scheduling()
returns table (ran int, failed int, warned int)
language plpgsql security definer set search_path to 'public' as $$
declare r int := 0; f int := 0; w int := 0; s text; v text; d text; n int; m int;
begin
  begin
    select count(*), string_agg(employee_code, ', ' order by employee_code) into n, d
      from employees where status = 'active' and primary_department_id is null;
    s := case when n = 0 then 'PASS' else 'FAIL' end;
    perform f_deployment_check_record('hr.assign_departments', s, n || ' active without a department',
      case when n = 0 then 'Every active employee has a primary department.' else 'Employee codes (names withheld): ' || left(d, 400) end);
    r := r + 1; if s = 'FAIL' then f := f + 1; end if;
  exception when others then perform f_deployment_check_record('hr.assign_departments', 'FAIL', 'error', left(sqlerrm, 200)); r := r + 1; f := f + 1; end;

  begin
    select count(*) filter (where verified_by is null and source like 'seeded%'), count(*) into n, m
      from employee_department_skill where retired_at is null;
    s := case when n = 0 then 'PASS' else 'FAIL' end;
    perform f_deployment_check_record('hr.verify_seeded_skills', s, n || ' of ' || m || ' rows unverified',
      case when n = 0 then 'Every seeded training row has a verifier.' else n || ' rows still carry source=seeded with no verified_by. HR sets verified_by, trained_on, trained_by.' end);
    r := r + 1; if s = 'FAIL' then f := f + 1; end if;
  exception when others then perform f_deployment_check_record('hr.verify_seeded_skills', 'FAIL', 'error', left(sqlerrm, 200)); r := r + 1; f := f + 1; end;

  begin
    select count(*) into n from v_floaters;
    select count(*) into m from departments dp where dp.active
      and not exists (select 1 from employee_department_skill s2 join employees e on e.id = s2.employee_id
                      where s2.department_id = dp.id and s2.retired_at is null and e.status = 'active' and e.primary_department_id is distinct from dp.id);
    s := case when n > 0 and m = 0 then 'PASS' else 'WARN' end;
    perform f_deployment_check_record('hr.trained_in_departments', s, n || ' floaters; ' || m || ' departments with no trained-in backup',
      case when s = 'PASS' then 'Floaters exist and every department has at least one trained-in person outside its primaries.'
           else 'Floater = trained or in training in 2+ departments (owner ruling 12 Sep). Add a row per extra department per person.' end);
    r := r + 1; if s = 'WARN' then w := w + 1; end if;
  exception when others then perform f_deployment_check_record('hr.trained_in_departments', 'FAIL', 'error', left(sqlerrm, 200)); r := r + 1; f := f + 1; end;

  begin
    select count(*) into n from schedule_drafts where status = 'posted' and covers_to >= date '2026-09-21';
    s := case when n > 0 then 'PASS' else 'PENDING' end;
    perform f_deployment_check_record('sched.first_real_draft', s, n || ' posted drafts covering ≥ 21 Sep',
      case when n > 0 then 'A real schedule has been posted by a sign-off role.' else 'No draft covering the week of 21 Sep has been posted yet. Preconditions: hr.assign_departments, hr.verify_seeded_skills.' end);
    r := r + 1;
  exception when others then perform f_deployment_check_record('sched.first_real_draft', 'FAIL', 'error', left(sqlerrm, 200)); r := r + 1; f := f + 1; end;

  begin
    select count(*) filter (where not exists (select 1 from lifecycle_progress p where p.employee_id = e.id)), count(*) into n, m
      from employees e where e.status = 'active';
    s := case when n = 0 then 'PASS' else 'WARN' end;
    perform f_deployment_check_record('sched.onboarding_tracking', s, n || ' of ' || m || ' active have no lifecycle rows',
      case when n = 0 then 'Every active employee has onboarding steps on record.' else 'lifecycle_steps has 21 steps; nobody has been taken through them in the OS yet. HR starts a lifecycle per person (f_start_lifecycle).' end);
    r := r + 1; if s = 'WARN' then w := w + 1; end if;
  exception when others then perform f_deployment_check_record('sched.onboarding_tracking', 'FAIL', 'error', left(sqlerrm, 200)); r := r + 1; f := f + 1; end;

  return query select r, f, w;
end $$;

select cron.schedule('deployment-tracker-scheduling', '11 * * * *', 'select * from public.f_deployment_checks_run_scheduling();');
select * from public.f_deployment_checks_run_scheduling();
