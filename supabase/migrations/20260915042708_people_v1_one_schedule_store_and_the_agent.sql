-- BP-5-5 People v1 (board row bp.d8.agents_v1, HR half): the weekly draft lands on Today as a decision for a sign-off
-- role — post / discard / assign / defer — and the schedule has ONE store.
--
-- Measured 15 Sep: the rule-based drafter posts into public.employee_schedules (8 OS views, 4 functions read it),
-- while 46 HR-platform functions (Schedule, Calendar, Coverage, Kiosk, labour) read hr.shifts — two definitions of
-- "the schedule"; a posted week would never have appeared on the HR screens, and the onboarding step
-- scheduling.first_week (which counts hr.shifts) could never flip. Bridge, depth-guarded both ways, id shared:
-- employee_schedules → hr.shifts (person = the same id, node = the department's org node, zone by name) and
-- hr.shifts → employee_schedules (a shift placed in the HR builder reaches the OS store — and meets the OS guard:
-- no active employee, no agent registration, expired badge → the insert is refused in words, in the HR screen).
--
-- People v1 (cron people-agent-v1, daily 10:00 UTC): for every week inside the policy's draft horizon with no
-- draft or posted schedule, draft it through f_draft_schedule (the same drafter a person uses, through
-- f_schedule_candidates, every rule a row in scheduling_policy). Today: source 'schedule_draft' from
-- schedule_drafts.status = 'draft' (its coverage, conflicts, open shifts and projected hours as the figure, its
-- conflict lines as members), offered to the sign-off roles of scheduling_policy; f_decide: post →
-- f_post_schedule (the sign-off check stands), discard → hr.tg_discard_draft with the reason (≥ 15 characters),
-- assign / defer as everywhere else. Additive only. (Today and f_decide follow in the next two migrations.)
set search_path = public;

-- ── A · one schedule store: employee_schedules ⇄ hr.shifts ───────────────────────────────────────────────────────
create or replace function hr.f_os_schedule_to_shift_trigger() returns trigger
language plpgsql security definer set search_path = hr, public as $$
declare v_node uuid; v_dept uuid; v_zone text;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    delete from hr.shifts s where s.id = old.id;
    return old;
  end if;
  if new.employee_id is null or new.work_date is null or new.planned_start is null or new.planned_end is null or new.planned_start = new.planned_end then return new; end if;
  if not exists (select 1 from hr.people p where p.id = new.employee_id) then return new; end if;
  v_dept := coalesce(new.department_id, (select z.department_id from public.zones z where z.id = new.zone_id));
  select n.id into v_node from hr.org_nodes n where n.node_type = 'department' and (n.config->>'os_department_id')::uuid = v_dept;
  if v_node is null then v_node := hr.tg_facility_node_id(); end if;
  v_zone := coalesce(new.zone, (select z.name from public.zones z where z.id = new.zone_id));
  insert into hr.shifts (id, node_id, person_id, zone, shift_date, start_time, end_time, notes, status, shift_type, is_open_shift, crosses_midnight, created_at, updated_at)
  values (new.id, v_node, new.employee_id, v_zone, new.work_date, new.planned_start, new.planned_end, new.note,
          case when new.status in ('cancelled', 'void') then 'cancelled' else 'scheduled' end, 'custom', false, new.planned_end < new.planned_start, coalesce(new.created_at, now()), now())
  on conflict (id) do update set node_id = excluded.node_id, person_id = excluded.person_id, zone = excluded.zone, shift_date = excluded.shift_date,
      start_time = excluded.start_time, end_time = excluded.end_time, notes = excluded.notes, status = excluded.status, crosses_midnight = excluded.crosses_midnight, updated_at = now();
  return new;
end $$;
drop trigger if exists os_schedule_to_shift on public.employee_schedules;
create trigger os_schedule_to_shift after insert or update or delete on public.employee_schedules for each row execute function hr.f_os_schedule_to_shift_trigger();
comment on function hr.f_os_schedule_to_shift_trigger() is 'BP-5-5: a posted OS schedule line (employee_schedules) is the same shift in hr.shifts — one store, the id shared; the HR screens show what the drafter posted.';

create or replace function hr.f_shift_to_os_schedule_trigger() returns trigger
language plpgsql security definer set search_path = hr, public as $$
declare v_dept uuid; v_zone_id uuid;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    delete from public.employee_schedules s where s.id = old.id;
    return old;
  end if;
  if new.person_id is null or new.is_open_shift then return new; end if;   -- open shifts live in public.open_shifts
  if not exists (select 1 from public.employees e where e.id = new.person_id) then return new; end if;
  select (n.config->>'os_department_id')::uuid into v_dept from hr.org_nodes n where n.id = new.node_id and n.node_type = 'department';
  select z.id into v_zone_id from public.zones z where z.active and z.name = new.zone limit 1;
  insert into public.employee_schedules (id, employee_id, work_date, department_id, zone, zone_id, planned_start, planned_end, status, note)
  values (new.id, new.person_id, new.shift_date, coalesce(v_dept, (select z.department_id from public.zones z where z.id = v_zone_id)), new.zone, v_zone_id, new.start_time, new.end_time,
          case when new.status in ('cancelled', 'void') then 'cancelled' else 'scheduled' end, new.notes)
  on conflict (id) do update set employee_id = excluded.employee_id, work_date = excluded.work_date, department_id = excluded.department_id, zone = excluded.zone, zone_id = excluded.zone_id,
      planned_start = excluded.planned_start, planned_end = excluded.planned_end, status = excluded.status, note = excluded.note;
  return new;
end $$;
drop trigger if exists shift_to_os_schedule on hr.shifts;
create trigger shift_to_os_schedule after insert or update or delete on hr.shifts for each row execute function hr.f_shift_to_os_schedule_trigger();
comment on function hr.f_shift_to_os_schedule_trigger() is 'BP-5-5: a shift placed in the HR builder (hr.shifts) is the same line in public.employee_schedules — it meets the OS guard (active employee, agent registration, badge date) and is refused in words when it fails.';

-- ── B · People v1: draft the weeks inside the horizon that nobody has drafted ────────────────────────────────────
create or replace function public.f_people_agent_v1()
returns jsonb language plpgsql security definer set search_path = public as $$
declare pol public.scheduling_policy%rowtype; v_ws date; v_end date; v_id uuid; v_drafted uuid[] := '{}'; v_skipped int := 0; v_err text[] := '{}';
begin
  select * into pol from public.scheduling_policy limit 1;
  if pol.id is null then return jsonb_build_object('ok', false, 'why', 'no scheduling policy row', 'at', now()); end if;
  v_ws := date_trunc('week', current_date)::date + 7;                                   -- next Monday
  v_end := current_date + coalesce(pol.draft_horizon_days, 14);
  while v_ws <= v_end loop
    if exists (select 1 from public.schedule_drafts d where d.status in ('draft', 'posted') and d.covers_from <= v_ws + 6 and d.covers_to >= v_ws and d.department_id is null) then
      v_skipped := v_skipped + 1;
    else
      begin
        v_id := public.f_draft_schedule(v_ws, v_ws + 6, null, 'agent', 'People v1', 'People v1 draft ' || to_char(v_ws, 'DD Mon') || ' → ' || to_char(v_ws + 6, 'DD Mon YYYY'));
        v_drafted := v_drafted || v_id;
      exception when others then v_err := v_err || (v_ws::text || ': ' || sqlerrm);
      end;
    end if;
    v_ws := v_ws + 7;
  end loop;
  return jsonb_build_object('ok', true, 'drafted', to_jsonb(v_drafted), 'skipped_already_drafted', v_skipped, 'errors', to_jsonb(v_err), 'horizon_days', pol.draft_horizon_days, 'at', now());
end $$;
revoke all on function public.f_people_agent_v1() from public, anon;
comment on function public.f_people_agent_v1() is 'BP-5-5 People v1: drafts every week inside the policy''s draft horizon that has no draft or posted schedule, through the rule-based drafter. The draft is a decision on Today for the sign-off roles; nothing posts itself.';
insert into public.agent_registry (agent_key, display_name, kind, what_it_watches, why_it_matters, owner, expected_every_mins, evidence_table, verified_by)
values ('agent:people_v1', 'People v1', 'agent',
        'The weeks inside the scheduling policy''s draft horizon: every one without a draft or posted schedule gets a rule-based draft, which lands on Today for a sign-off role to post or discard.',
        'BP-5-5: the schedule is drafted by the platform and signed by a person; go-live week needs a posted schedule.',
        'Agent I', 1440, 'schedule_drafts', 'select count(*) from schedule_drafts where agent_name = ''People v1'' and created_at > now() - interval ''2 days'';')
on conflict (agent_key) do nothing;
select cron.unschedule(jobid) from cron.job where jobname = 'people-agent-v1';
select cron.schedule('people-agent-v1', '0 10 * * *', $$select public.f_people_agent_v1();$$);

-- ── C · the draft on Today ───────────────────────────────────────────────────────────────────────────────────────
alter table public.decisions drop constraint if exists decisions_source_check;
alter table public.decisions add constraint decisions_source_check
  check (source in ('finding_group', 'report', 'issue_group', 'question', 'enhancement', 'correction', 'qa_enhancement', 'onboarding', 'schedule_draft'));

create or replace view public.v_schedule_draft_decisions as
select d.id, d.title, d.covers_from, d.covers_to, d.department_id, dp.name as department, d.drafted_by_kind, d.agent_name, d.rationale, d.created_at,
       d.projected_hours, d.projected_ot_hours, d.projected_cost_loaded,
       (select count(*) from public.schedule_draft_lines l where l.draft_id = d.id) as lines,
       (select count(*) from public.schedule_draft_lines l where l.draft_id = d.id and l.employee_id is not null and not l.is_open_shift) as placed,
       (select count(*) from public.schedule_draft_lines l where l.draft_id = d.id and l.is_open_shift) as open_shifts,
       (select count(*) from public.schedule_draft_lines l where l.draft_id = d.id and l.conflict is not null) as conflicts,
       (select count(distinct l.employee_id) from public.schedule_draft_lines l where l.draft_id = d.id and l.employee_id is not null) as people,
       coalesce((select signoff_roles from public.scheduling_policy limit 1), '{owner}'::text[]) as signoff_roles
  from public.schedule_drafts d
  left join public.departments dp on dp.id = d.department_id
 where d.status = 'draft';
grant select on public.v_schedule_draft_decisions to authenticated;
comment on view public.v_schedule_draft_decisions is 'BP-5-5: every schedule draft waiting for a sign-off role, with its figure (lines, placed, open shifts, conflicts, people, projected hours) — the rows Today offers as decisions.';;
