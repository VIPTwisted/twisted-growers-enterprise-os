-- ENHANCEMENTS #18, #17, #21, #26 from docs/07_DEEP_SCOPE_ENHANCEMENTS.md.
-- Each was specified and never built. Nothing here is invented.

-- ── #18 · ONBOARDING / TERMINATION AUTOMATION ────────────────────────
-- "checklists tied to hire/term: badge issue/return, Metrc agent add/remove,
--  access grant/revoke. Termination revokes at the identity layer."
--
-- The steps are ROWS, not code, so HR changes the process without a deploy.
-- Every step carries who owns it and whether it is a legal obligation, because
-- "return the locker key" and "deactivate the CCC registration" must not look
-- alike on a checklist.
create table if not exists public.lifecycle_steps (
  id            uuid primary key default gen_random_uuid(),
  phase         text not null check (phase in ('onboarding','offboarding')),
  ordinal       integer not null,
  title         text not null,
  detail        text,
  owner_role    text,
  due_offset_days integer,          -- relative to start date / last day
  is_legal      boolean not null default false,
  blocks_start  boolean not null default false,
  blocks_close  boolean not null default false,
  active        boolean not null default true,
  unique (phase, ordinal)
);
comment on table public.lifecycle_steps is
  'The checklist itself, as rows. is_legal marks a statutory or CCC obligation; '
  'blocks_start stops a person working until it is done; blocks_close stops a '
  'departure being marked complete. Edit the process here, never in code.';

insert into public.lifecycle_steps (phase, ordinal, title, detail, owner_role, due_offset_days, is_legal, blocks_start) values
 ('onboarding',1,'I-9 verification','Original documents, list A or B+C. Federal deadline is three business days from the start date.','hr',3,true,true),
 ('onboarding',2,'Cannabis Agent Registration submitted','Cannot touch product without it. State processing runs about three weeks.','hr',-21,true,true),
 ('onboarding',3,'W-4 and Massachusetts M-4','Withholding cannot be calculated without both.','hr',1,true,false),
 ('onboarding',4,'Direct deposit details','Collected by payroll, never stored in this system in plain text.','hr',3,false,false),
 ('onboarding',5,'Emergency contact','Required before floor access.','hr',0,false,true),
 ('onboarding',6,'System login created','app_users row linked to the employee record.','admin',0,false,false),
 ('onboarding',7,'Wall terminal PIN set','So they can clock in on day one without an app login.','hr',0,false,true),
 ('onboarding',8,'Employee manual issued and signed','Signature binds to the version issued.','hr',7,true,false),
 ('onboarding',9,'Gowning and safety SOP signed','Required reading before entering a clean area.','manager',0,true,true),
 ('onboarding',10,'Badge and keys issued','Physical access.','manager',0,false,false),
 ('onboarding',11,'Assigned to a department and zone','Otherwise they cannot be scheduled.','manager',0,false,true),
 ('onboarding',12,'Manager assigned','employees.manager_id — decides who approves their time and their write-ups.','hr',0,false,false)
on conflict (phase, ordinal) do nothing;

insert into public.lifecycle_steps (phase, ordinal, title, detail, owner_role, due_offset_days, is_legal, blocks_close) values
 ('offboarding',1,'Final pay calculated','Massachusetts Wage Act: same day for an involuntary discharge, next regular pay day for a resignation.','hr',0,true,true),
 ('offboarding',2,'Accrued time off paid or forfeited','Per the leave policy in force for that person.','hr',0,true,true),
 ('offboarding',3,'CCC Agent Registration deactivated in Metrc','An active registration for someone who has left is a finding.','hr',1,true,true),
 ('offboarding',4,'System access revoked','Revoke at the identity layer, not just the application.','admin',0,true,true),
 ('offboarding',5,'Wall terminal PIN cleared','Otherwise they can still clock in.','hr',0,false,true),
 ('offboarding',6,'Badge, keys and equipment returned','Log what is outstanding rather than assuming.','manager',0,false,false),
 ('offboarding',7,'Final timecard approved','Cannot be approved with a missing clock-out.','manager',0,false,true),
 ('offboarding',8,'Exit interview offered','Offered, not required. Record either way.','hr',7,false,false),
 ('offboarding',9,'Employee file closed and retained','Massachusetts payroll records: three years.','hr',14,true,false)
on conflict (phase, ordinal) do nothing;

create table if not exists public.lifecycle_progress (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  step_id      uuid not null references public.lifecycle_steps(id) on delete cascade,
  phase        text not null,
  due_on       date,
  done_at      timestamptz,
  done_by      uuid references auth.users(id),
  note         text,
  na_reason    text,
  created_at   timestamptz not null default now(),
  unique (employee_id, step_id)
);
create index if not exists lcp_open_idx on public.lifecycle_progress(phase, due_on)
  where done_at is null;

-- Raise the checklist automatically. A step nobody created is a step nobody does.
create or replace function public.f_start_lifecycle(
  p_employee_id uuid, p_phase text, p_anchor date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.f_can_decide_hr() then
    raise exception 'Not permitted to start a lifecycle checklist.' using errcode='42501';
  end if;
  insert into public.lifecycle_progress (employee_id, step_id, phase, due_on)
  select p_employee_id, s.id, s.phase, p_anchor + coalesce(s.due_offset_days,0)
  from public.lifecycle_steps s
  where s.phase = p_phase and s.active
  on conflict (employee_id, step_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace view public.v_lifecycle_open with (security_invoker = on) as
select p.id, p.employee_id, e.employee_code, e.full_name, p.phase,
       s.ordinal, s.title, s.detail, s.owner_role, s.is_legal,
       s.blocks_start, s.blocks_close, p.due_on,
       (p.due_on is not null and p.due_on < current_date) as overdue,
       (current_date - p.due_on)                          as days_overdue
from public.lifecycle_progress p
join public.lifecycle_steps s on s.id = p.step_id
join public.employees e on e.id = p.employee_id
where p.done_at is null and p.na_reason is null
order by s.is_legal desc, p.due_on nulls last, s.ordinal;

comment on view public.v_lifecycle_open is
  'Every outstanding onboarding and offboarding step. Legal obligations sort '
  'first — an unreturned locker key and an active CCC registration for someone '
  'who left are not the same problem.';

-- ── #17 · WITNESSED APPROVALS ────────────────────────────────────────
-- "re-auth (PIN/passkey) at the instant of approval; the approval row stores
--  the challenge."
create table if not exists public.approval_witness (
  id            uuid primary key default gen_random_uuid(),
  subject_table text not null,
  subject_id    uuid not null,
  action        text not null,
  approver      uuid references auth.users(id),
  approver_name text,
  challenge     text not null,
  method        text not null default 'pin' check (method in ('pin','passkey','password')),
  ip            inet,
  user_agent    text,
  witnessed_at  timestamptz not null default now()
);
create index if not exists aw_subject_idx on public.approval_witness(subject_table, subject_id);
comment on table public.approval_witness is
  'Enhancement #17. Proof that a named person re-authenticated at the MOMENT of '
  'approval, not merely that a session was open. challenge holds what they were '
  'asked to confirm, so the record shows what was approved, not just that '
  'something was. Required for pay-run approval and for issuing a write-up.';

-- ── #21 · PHOTO EVIDENCE ─────────────────────────────────────────────
-- "grading, receiving damage, QC holds, incidents; storage bucket + hash,
--  linked from the row."
create table if not exists public.hr_attachment (
  id            uuid primary key default gen_random_uuid(),
  subject_table text not null,
  subject_id    uuid not null,
  storage_path  text not null,
  file_name     text,
  mime_type     text,
  bytes         bigint,
  sha256        text,
  caption       text,
  uploaded_by   uuid references auth.users(id),
  uploaded_at   timestamptz not null default now()
);
create index if not exists hratt_subject_idx on public.hr_attachment(subject_table, subject_id);
comment on table public.hr_attachment is
  'Enhancement #21. Photographs and files against an incident, a write-up or a '
  'compliance record. sha256 makes the file tamper-evident — a photograph that '
  'can be quietly swapped is not evidence.';

-- ── #26 · KPI DEFINITIONS AS DATA ────────────────────────────────────
-- "every Control Tower metric with formula, owner, target in a table (Law #4;
--  also kills the ambiguous-denominator disease)."
create table if not exists public.kpi_definitions (
  key           text primary key,
  department    text not null,
  label         text not null,
  question      text not null,
  formula       text not null,
  source_view   text,
  numerator     text,
  denominator   text,
  unit          text,
  target        numeric,
  target_direction text check (target_direction in ('higher','lower','range')),
  warn_at       numeric,
  critical_at   numeric,
  owner_role    text,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);
comment on table public.kpi_definitions is
  'Enhancement #26. Every HR tile defined here rather than in the component: the '
  'question it answers, its formula, and its denominator stated explicitly. The '
  'ambiguous denominator is how two dashboards disagree while both being right.';

insert into public.kpi_definitions
 (key, department, label, question, formula, source_view, numerator, denominator, unit, target, target_direction, warn_at, critical_at, owner_role) values
 ('hr.legally_ready','Human Resources','Legally ready to work',
  'How many active staff can lawfully be on the floor today?',
  'active employees minus those whose agent registration is missing, expired, or inside the renewal window',
  'v_schedulable','count where schedulable_state = ''schedulable''','count of active employees','people',null,'higher',null,null,'hr'),
 ('hr.licence_action','Human Resources','Licences needing action',
  'Who cannot be scheduled with confidence?',
  'count where badge_expires is null, past, or within 30 days',
  'v_schedulable','count with licence problem','—','people',0,'lower',1,1,'hr'),
 ('hr.weekly_cost','Human Resources','Weekly labour cost',
  'What does a normal week cost, loaded?',
  'sum(planned hours x rate x (1 + burden)) across staff on rates',
  'v_payroll_forecast','sum(loaded_weekly_cost)','—','dollars',null,'lower',null,null,'cfo'),
 ('hr.schedule_adherence','Human Resources','Schedule adherence',
  'How closely did worked hours follow the posted schedule?',
  'worked hours / scheduled hours, capped at 200%, per employee per day',
  'v_schedule_vs_worked','sum(worked_hours)','sum(scheduled_hours)','percent',96,'higher',93,88,'manager'),
 ('hr.absence_rate','Human Resources','Absence rate',
  'What share of scheduled shifts were not worked?',
  'shifts with no punch / shifts scheduled',
  'v_schedule_vs_worked','count where flag = ''no_show_or_unrecorded''','count of scheduled shifts','percent',3.1,'lower',4,6,'hr'),
 ('hr.overtime_hours','Human Resources','Overtime hours',
  'How many hours were paid above the weekly threshold?',
  'sum(greatest(weekly worked - attendance_policy.ot_weekly_threshold, 0)) for hourly staff only',
  'v_ot_watch','sum(ot_hours)','—','hours',0,'lower',10,30,'hr'),
 ('hr.no_login','Human Resources','Cannot sign in',
  'How many active staff have no system login?',
  'active employees with no app_users row',
  null,'count of active employees without app_users','count of active employees','people',0,'lower',1,5,'admin'),
 ('hr.unsigned_documents','Human Resources','Documents unsigned',
  'How many required documents are unsigned at their current version?',
  'assignments where no acknowledgement exists for the live version',
  'v_document_compliance','count where state <> ''signed''','count of assignments','count',0,'lower',1,10,'hr')
on conflict (key) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────
alter table public.lifecycle_steps    enable row level security;
alter table public.lifecycle_progress enable row level security;
alter table public.approval_witness   enable row level security;
alter table public.hr_attachment      enable row level security;
alter table public.kpi_definitions    enable row level security;

create policy lcs_read on public.lifecycle_steps for select to authenticated using (true);
create policy lcp_read on public.lifecycle_progress for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy lcp_write on public.lifecycle_progress for all to authenticated
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());
create policy aw_read on public.approval_witness for select to authenticated
  using (public.f_can_read_hr());
create policy att_read on public.hr_attachment for select to authenticated
  using (public.f_can_read_hr());
create policy kpi_read on public.kpi_definitions for select to authenticated using (true);
create policy kpi_write on public.kpi_definitions for all to authenticated
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());

grant select on public.lifecycle_steps, public.lifecycle_progress, public.v_lifecycle_open,
                public.approval_witness, public.hr_attachment, public.kpi_definitions to authenticated;
grant insert, update on public.lifecycle_progress to authenticated;
grant insert on public.approval_witness, public.hr_attachment to authenticated;
grant insert, update, delete on public.kpi_definitions, public.lifecycle_steps to authenticated;
grant execute on function public.f_start_lifecycle(uuid,text,date) to authenticated;;
