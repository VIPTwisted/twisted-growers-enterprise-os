-- THE SCHEDULE ENGINE.
-- Owner, 8 Aug 2026: human or AI may DRAFT; only a human may POST. Easy to
-- edit for last-minute call-outs and on-the-fly re-zoning. Open shifts and
-- extra hours announced to staff who can claim them.
--
-- A posted schedule is a promise to fifteen people about their week, so
-- posting is a deliberate, versioned, attributable act — never a side effect.

-- ── When people CAN work. Scheduling without this is guessing. ───────
create table if not exists public.employee_availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday integer check (weekday between 0 and 6),
  specific_date date,
  available boolean not null default true,
  from_time time, to_time time,
  max_hours_per_week numeric(5,2),
  reason text,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  check (weekday is not null or specific_date is not null)
);
create index if not exists avail_emp_idx on public.employee_availability(employee_id, weekday, specific_date);
comment on table public.employee_availability is
  'A standing pattern (weekday) or a one-off (specific_date). available=false is a '
  'blackout — "cannot work Tuesdays" is as important as "can work Saturdays". Staff '
  'maintain their own; a manager can override.';

-- ── Drafts. Human or agent writes here. Staff see nothing. ───────────
create table if not exists public.schedule_drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  covers_from date not null,
  covers_to date not null,
  department_id uuid references public.departments(id) on delete cascade,
  drafted_by_kind text not null default 'human' check (drafted_by_kind in ('human','agent')),
  drafted_by uuid references auth.users(id),
  agent_name text,
  rationale text,
  status text not null default 'draft'
    check (status in ('draft','review','posted','superseded','discarded')),
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  supersedes_id uuid references public.schedule_drafts(id) on delete set null,
  projected_hours numeric(10,2),
  projected_cost_loaded numeric(12,2),
  projected_ot_hours numeric(10,2),
  created_at timestamptz not null default now()
);
create index if not exists sdraft_window_idx on public.schedule_drafts(covers_from, covers_to, status);
comment on table public.schedule_drafts is
  'A proposed week. drafted_by_kind=agent means an AI wrote it — it still cannot '
  'reach staff. posted_by is always a person, and posting is what makes the lines '
  'real in employee_schedules.';

create table if not exists public.schedule_draft_lines (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.schedule_drafts(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  work_date date not null,
  zone_id uuid references public.zones(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  planned_start timestamptz,
  planned_end timestamptz,
  break_window_id uuid references public.break_windows(id) on delete set null,
  is_open_shift boolean not null default false,
  note text,
  conflict text,
  created_at timestamptz not null default now()
);
create index if not exists sdl_draft_idx on public.schedule_draft_lines(draft_id, work_date);
comment on column public.schedule_draft_lines.conflict is
  'Why this line cannot stand — unavailable, licence expired, would breach '
  'overtime, double-booked. Computed at draft time so a person sees the problem '
  'before posting, not after.';

-- ── Posting. The only path from draft to what staff see. ─────────────
create or replace function public.f_post_schedule(p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d public.schedule_drafts%rowtype; v_n int := 0; v_open int := 0;
begin
  if not public.f_can_decide_hr() then
    raise exception 'Only a person with scheduling rights may post a schedule.'
      using errcode = '42501';
  end if;

  select * into v_d from public.schedule_drafts where id = p_draft_id;
  if v_d.id is null then raise exception 'No such draft.'; end if;
  if v_d.status = 'posted' then raise exception 'That draft is already posted.'; end if;

  /* Replace only the window this draft covers, only for its department.
     Anything outside is untouched — posting Packaging must not wipe Cultivation. */
  delete from public.employee_schedules s
   where s.work_date between v_d.covers_from and v_d.covers_to
     and (v_d.department_id is null or s.department_id = v_d.department_id);

  insert into public.employee_schedules
    (employee_id, work_date, shift_template_id, department_id, zone, planned_start, planned_end, status, note)
  select l.employee_id, l.work_date, l.shift_template_id,
         coalesce(l.department_id, v_d.department_id), z.name,
         l.planned_start, l.planned_end, 'scheduled', l.note
  from public.schedule_draft_lines l
  left join public.zones z on z.id = l.zone_id
  where l.draft_id = p_draft_id and l.employee_id is not null and not l.is_open_shift;
  get diagnostics v_n = row_count;

  insert into public.open_shifts
    (draft_id, work_date, zone_id, department_id, shift_template_id,
     planned_start, planned_end, reason, posted_by)
  select p_draft_id, l.work_date, l.zone_id, coalesce(l.department_id, v_d.department_id),
         l.shift_template_id, l.planned_start, l.planned_end,
         coalesce(l.note,'Open shift'), auth.uid()
  from public.schedule_draft_lines l
  where l.draft_id = p_draft_id and l.is_open_shift;
  get diagnostics v_open = row_count;

  update public.schedule_drafts
     set status='posted', posted_by=auth.uid(), posted_at=now() where id=p_draft_id;
  update public.schedule_drafts
     set status='superseded' where id = v_d.supersedes_id and status <> 'superseded';

  return jsonb_build_object('posted_shifts', v_n, 'open_shifts', v_open,
                            'from', v_d.covers_from, 'to', v_d.covers_to);
end $$;
comment on function public.f_post_schedule is
  'The only route from a draft to what staff see. Requires a human with scheduling '
  'rights. Replaces only the window and department the draft covers.';

-- ── Open shifts, claims, swaps, and the call for extra hours. ────────
create table if not exists public.open_shifts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references public.schedule_drafts(id) on delete set null,
  work_date date not null,
  zone_id uuid references public.zones(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  planned_start timestamptz, planned_end timestamptz,
  reason text,
  offer_kind text not null default 'open' check (offer_kind in ('open','extra_hours','weekend','second_shift','coverage')),
  claim_mode text not null default 'approval' check (claim_mode in ('first_come','approval')),
  visible_to text not null default 'department' check (visible_to in ('department','company','role')),
  role_id uuid references public.roles_catalog(id) on delete set null,
  status text not null default 'open' check (status in ('open','claimed','filled','cancelled','expired')),
  filled_by uuid references public.employees(id) on delete set null,
  posted_by uuid references auth.users(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists openshift_live_idx on public.open_shifts(status, work_date);
comment on table public.open_shifts is
  'An unfilled shift, or a call for extra hours, a weekend or a second shift. '
  'claim_mode=first_come fills it the moment someone claims; approval holds it for '
  'a manager. This is how the Packaging gap gets seen by the people who could fill it.';

create table if not exists public.shift_claims (
  id uuid primary key default gen_random_uuid(),
  open_shift_id uuid not null references public.open_shifts(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','declined','withdrawn')),
  would_be_overtime boolean,
  decided_by uuid references auth.users(id), decided_at timestamptz, decision_note text,
  unique (open_shift_id, employee_id)
);
comment on column public.shift_claims.would_be_overtime is
  'Computed when the claim is made. A manager approving a claim should know it '
  'costs time and a half before they approve it, not after payroll runs.';

create table if not exists public.shift_swaps (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.employees(id) on delete cascade,
  counterparty uuid references public.employees(id) on delete cascade,
  give_schedule_id uuid references public.employee_schedules(id) on delete cascade,
  take_schedule_id uuid references public.employee_schedules(id) on delete cascade,
  reason text,
  counterparty_agreed boolean,
  counterparty_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','awaiting_manager','approved','denied','cancelled')),
  decided_by uuid references auth.users(id), decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now()
);
comment on table public.shift_swaps is
  'Both parties agree, then a manager approves. Two gates because a swap changes '
  'two people''s pay and the coverage of two zones.';

create table if not exists public.callouts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  schedule_id uuid references public.employee_schedules(id) on delete set null,
  reason_code text not null,
  explanation text,
  notice_hours numeric(6,2),
  meets_notice boolean,
  called_at timestamptz not null default now(),
  covered_by uuid references public.employees(id) on delete set null,
  open_shift_id uuid references public.open_shifts(id) on delete set null,
  occurrence_id uuid references public.attendance_occurrences(id) on delete set null,
  status text not null default 'open' check (status in ('open','covered','uncovered','excused'))
);
comment on table public.callouts is
  'Someone cannot make their shift. notice_hours is measured against '
  'attendance_policy.notice_hours_required, so whether it was proper notice is a '
  'computed fact, not an argument later. Coverage links straight to the open shift '
  'it created.';

-- ── Who can actually take a shift on a given day. ────────────────────
create or replace view public.v_schedulable with (security_invoker = on) as
select e.id as employee_id, e.employee_code, e.full_name,
       d.name as department, e.hours_basis,
       e.badge_expires,
       (e.badge_expires is not null and e.badge_expires >= current_date) as licence_valid,
       (e.status::text = 'active')                                       as employed,
       coalesce(e.weekly_target_hours, 40)                               as target_hours,
       exists (select 1 from public.employee_availability a
                where a.employee_id = e.id and a.available = false
                  and (a.specific_date = current_date
                       or a.weekday = extract(dow from current_date)::int))
                                                                          as blacked_out,
       case
         when e.status::text <> 'active'                                   then 'not employed'
         when e.badge_expires is null                                      then 'no licence on file'
         when e.badge_expires < current_date                               then 'licence expired'
         when exists (select 1 from public.employee_availability a
                       where a.employee_id=e.id and a.available=false
                         and (a.specific_date=current_date
                              or a.weekday=extract(dow from current_date)::int))
                                                                          then 'unavailable today'
         else 'schedulable'
       end as schedulable_state
from public.employees e
left join public.departments d on d.id = e.primary_department_id;

comment on view public.v_schedulable is
  'Who can legally and practically take a shift today. A lapsed agent registration '
  'makes someone unschedulable no matter how available they are — which is the one '
  'thing a general workforce product cannot model.';

do $$ declare t text; begin
  foreach t in array array['employee_availability','schedule_drafts','schedule_draft_lines',
    'open_shifts','shift_claims','shift_swaps','callouts']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

create policy avail_self on public.employee_availability for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy avail_mine on public.employee_availability for all to authenticated
  using (employee_id = public.f_my_employee_id()) with check (employee_id = public.f_my_employee_id());
create policy draft_hr on public.schedule_drafts for select to authenticated using (public.f_can_read_hr());
create policy dline_hr on public.schedule_draft_lines for select to authenticated using (public.f_can_read_hr());
create policy open_read on public.open_shifts for select to authenticated using (true);
create policy claim_self on public.shift_claims for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy claim_mine on public.shift_claims for insert to authenticated
  with check (employee_id = public.f_my_employee_id());
create policy swap_self on public.shift_swaps for select to authenticated
  using (requested_by = public.f_my_employee_id() or counterparty = public.f_my_employee_id()
         or public.f_can_read_hr());
create policy swap_mine on public.shift_swaps for insert to authenticated
  with check (requested_by = public.f_my_employee_id());
create policy callout_self on public.callouts for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy callout_mine on public.callouts for insert to authenticated
  with check (employee_id = public.f_my_employee_id());

grant select on public.employee_availability, public.schedule_drafts, public.schedule_draft_lines,
                public.open_shifts, public.shift_claims, public.shift_swaps, public.callouts,
                public.v_schedulable to authenticated;
grant insert, update, delete on public.employee_availability to authenticated;
grant insert on public.shift_claims, public.shift_swaps, public.callouts to authenticated;
grant execute on function public.f_post_schedule(uuid) to authenticated;;
