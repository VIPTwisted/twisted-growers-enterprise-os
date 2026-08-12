-- Correction. My first pass added employees.auth_user_id and keyed the
-- policies on it. That was wrong: app_users(user_id, employee_id, role)
-- already maps a login to a person, and the platform already ships
-- current_app_role(), f_caller_is_admin() and has_permission(). Two
-- competing identity paths is how a policy silently drifts open, so the
-- new column is dropped and everything keys on app_users.

drop policy if exists att_occ_self_read on public.attendance_occurrences;
drop policy if exists hrq_self_read     on public.hr_review_queue;

drop index  if exists public.employees_auth_user_id_key;
alter table public.employees drop column if exists auth_user_id;

-- Who am I, as an employee row.
create or replace function public.f_my_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select employee_id from public.app_users where user_id = auth.uid()
$$;

-- Who may see other people's attendance and HR drafts. Deliberately
-- narrow: wages and discipline are the two things you cannot un-leak.
create or replace function public.f_can_read_hr()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.f_caller_is_admin(), false)
      or public.current_app_role() in ('owner','executive','hr','manager','cfo')
$$;

-- Who may decide — send, edit, defer, ignore. Narrower still.
create or replace function public.f_can_decide_hr()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.f_caller_is_admin(), false)
      or public.current_app_role() in ('owner','hr')
$$;

comment on function public.f_can_read_hr is
  'Read gate for attendance_occurrences and hr_review_queue. dept_head is '
  'deliberately excluded until the policy is scoped to their own department.';
comment on function public.f_can_decide_hr is
  'Write gate. Only owner, hr and admin may send or ignore a drafted HR action.';

-- ── attendance_occurrences ────────────────────────────────────────────
create policy att_occ_self_read on public.attendance_occurrences
  for select to authenticated
  using (employee_id = public.f_my_employee_id());

create policy att_occ_hr_read on public.attendance_occurrences
  for select to authenticated
  using (public.f_can_read_hr());

create policy att_occ_hr_write on public.attendance_occurrences
  for all to authenticated
  using (public.f_can_decide_hr())
  with check (public.f_can_decide_hr());

-- ── hr_review_queue ───────────────────────────────────────────────────
-- An employee never sees a pending draft about themselves. They see it
-- once it has been sent, or once it was ignored and filed to their record.
create policy hrq_self_read on public.hr_review_queue
  for select to authenticated
  using (status in ('sent','ignored') and employee_id = public.f_my_employee_id());

create policy hrq_hr_read on public.hr_review_queue
  for select to authenticated
  using (public.f_can_read_hr());

create policy hrq_hr_write on public.hr_review_queue
  for all to authenticated
  using (public.f_can_decide_hr())
  with check (public.f_can_decide_hr());

-- ── The variance view must not bypass the tables' RLS. ────────────────
alter view public.v_schedule_vs_worked set (security_invoker = on);;
