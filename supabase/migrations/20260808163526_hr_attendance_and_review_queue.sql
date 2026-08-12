-- HR layer: attendance occurrences, the AI review queue, and the
-- scheduled-vs-worked variance view. Additive only — nothing dropped,
-- nothing altered destructively. RLS on every new table.

-- 1. The missing link. Without this, a logged-in user cannot be tied to
--    an employee row, so no self-service policy can be written at all.
alter table public.employees
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists employees_auth_user_id_key
  on public.employees(auth_user_id) where auth_user_id is not null;

comment on column public.employees.auth_user_id is
  'Supabase auth user for this employee. Null until the person has a login. '
  'Every HR row-level policy keys on this.';

-- 2. Attendance occurrences. One row per event: late, absent, early out,
--    missed punch, no call no show. Points drive the escalation ladder.
create table if not exists public.attendance_occurrences (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  work_date      date not null,
  kind           text not null check (kind in
                   ('late','absent','early_out','missed_punch','no_call_no_show','left_early')),
  minutes        integer,
  reason_code    text,
  explanation    text,
  points         numeric(3,1) not null default 0,
  excused        boolean not null default false,
  status         text not null default 'open' check (status in
                   ('open','awaiting_explanation','under_review','excused','upheld','disputed')),
  time_entry_id  uuid references public.time_entries(id) on delete set null,
  decided_by     uuid references auth.users(id),
  decided_at     timestamptz,
  clears_on      date generated always as (work_date + interval '12 months') stored,
  created_at     timestamptz not null default now()
);

create index if not exists att_occ_emp_date_idx
  on public.attendance_occurrences(employee_id, work_date desc);
create index if not exists att_occ_open_idx
  on public.attendance_occurrences(status) where status <> 'upheld';

comment on table public.attendance_occurrences is
  'One row per attendance event. Points roll off 12 months to the day — see clears_on. '
  'Excused occurrences keep their row but carry 0 points, so the history stays complete.';

-- 3. The AI review queue. Agents draft; a person decides. Every outcome
--    is recorded, including the decision to ignore — that is what makes
--    enforcement provably consistent if it is ever challenged.
create table if not exists public.hr_review_queue (
  id               uuid primary key default gen_random_uuid(),
  agent            text not null check (agent in
                     ('hr_attendance','hr_discipline','hr_onboarding',
                      'hr_scheduling','hr_compliance')),
  kind             text not null,
  employee_id      uuid references public.employees(id) on delete cascade,
  severity         text not null default 'normal'
                     check (severity in ('info','normal','warn','high')),
  headline         text not null,
  rationale        text,
  evidence         jsonb not null default '{}'::jsonb,
  draft_body       text,
  edited_body      text,
  status           text not null default 'pending' check (status in
                     ('pending','sent','deferred','ignored','superseded')),
  decision_reason  text,
  decision_note    text,
  decided_by       uuid references auth.users(id),
  decided_at       timestamptz,
  defer_until      timestamptz,
  filed_at         timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists hrq_pending_idx
  on public.hr_review_queue(status, created_at desc);
create index if not exists hrq_employee_idx
  on public.hr_review_queue(employee_id, created_at desc);

comment on table public.hr_review_queue is
  'AI-drafted HR actions awaiting human review. status=ignored still files to the '
  'employee record — decision_reason and decision_note are required for that path, '
  'enforced in the application layer.';

-- 4. Scheduled vs worked. The variance HR asked for.
--    Scheduled: employee_schedules.planned_start/planned_end.
--    Worked:    time_entries clock_out - clock_in, less unpaid lunch.
create or replace view public.v_schedule_vs_worked as
with sched as (
  select employee_id, work_date, zone,
         sum(extract(epoch from (planned_end - planned_start)) / 3600.0)::numeric(6,2) as scheduled_hours
  from public.employee_schedules
  where planned_start is not null and planned_end is not null
  group by employee_id, work_date, zone
),
act as (
  select employee_id, work_date,
         sum(extract(epoch from (clock_out - clock_in)) / 3600.0
             - coalesce(unpaid_lunch_min,0) / 60.0)::numeric(6,2) as worked_hours,
         count(*) filter (where clock_out is null) as open_punches,
         min(clock_in)  as first_in,
         max(clock_out) as last_out
  from public.time_entries
  where clock_in is not null
  group by employee_id, work_date
)
select
  e.id                                        as employee_id,
  e.employee_code,
  e.full_name,
  coalesce(s.work_date, a.work_date)          as work_date,
  s.zone,
  coalesce(s.scheduled_hours, 0)              as scheduled_hours,
  coalesce(a.worked_hours, 0)                 as worked_hours,
  (coalesce(a.worked_hours,0) - coalesce(s.scheduled_hours,0))::numeric(6,2) as variance_hours,
  case when coalesce(s.scheduled_hours,0) = 0 then null
       else round(least(coalesce(a.worked_hours,0) / s.scheduled_hours, 2) * 100, 1)
  end                                         as adherence_pct,
  greatest(coalesce(a.worked_hours,0) - 8, 0)::numeric(6,2) as daily_ot_hours,
  a.first_in, a.last_out,
  coalesce(a.open_punches, 0)                 as open_punches,
  case
    when a.employee_id is null then 'no_show_or_unrecorded'
    when s.employee_id is null then 'unscheduled_work'
    when a.open_punches > 0     then 'missing_punch'
    when a.worked_hours > s.scheduled_hours + 0.25 then 'over'
    when a.worked_hours < s.scheduled_hours - 0.25 then 'under'
    else 'on_plan'
  end                                         as flag
from sched s
full outer join act a
  on a.employee_id = s.employee_id and a.work_date = s.work_date
join public.employees e
  on e.id = coalesce(s.employee_id, a.employee_id);

comment on view public.v_schedule_vs_worked is
  'Scheduled hours against actually worked, per employee per day. Both sides are '
  'currently empty — employee_schedules and time_entries have zero rows — so this '
  'returns nothing until punches and schedules exist.';

-- 5. RLS. Deny by default; a person sees only their own rows. Manager and
--    HR read paths deliberately left unwritten until the role model is
--    confirmed — an over-broad policy here exposes wages and discipline.
alter table public.attendance_occurrences enable row level security;
alter table public.hr_review_queue        enable row level security;

drop policy if exists att_occ_self_read on public.attendance_occurrences;
create policy att_occ_self_read on public.attendance_occurrences
  for select to authenticated
  using (employee_id in (select id from public.employees where auth_user_id = auth.uid()));

drop policy if exists hrq_self_read on public.hr_review_queue;
create policy hrq_self_read on public.hr_review_queue
  for select to authenticated
  using (
    status <> 'pending'
    and employee_id in (select id from public.employees where auth_user_id = auth.uid())
  );;
