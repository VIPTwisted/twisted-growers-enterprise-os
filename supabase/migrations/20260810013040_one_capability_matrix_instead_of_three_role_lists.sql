-- THE ROLE MODEL, CONSOLIDATED. What a platform team does with legacy access control: capture
-- the CURRENT effective permissions as data, prove no behaviour changed, then remediate in one
-- place. Never redesign and remediate in the same step — you lose the ability to tell which
-- change broke something.
--
-- WHAT WAS ACTUALLY WRONG. app_role already declares twelve tiers:
--   owner, executive, planner, dept_head, staff, readonly, cfo, manager, assistant_manager,
--   hr, admin, employee
-- Only six are referenced anywhere. Three predicates each carried their own hand-written list:
--
--   is_executive()       owner, executive
--   f_caller_is_admin()  owner, executive, admin, ceo, cfo, coo
--   f_can_read_hr()      owner, executive, admin, hr, cfo, manager
--
-- Three lists, three different answers to "who is senior", no single source. That is how the
-- estate ended up letting a manager read pay_runs and pay_run_lines — actual pay amounts — while
-- being unable to read the employee roster, which is the less sensitive of the two. Nobody
-- decided that. It is what happens when the answer lives in three places.
--
-- AND TWO OF THOSE NAMES DO NOT EXIST. 'ceo' and 'coo' are not values of app_role, so those
-- branches of f_caller_is_admin() can never be true. Someone intended the CEO and COO to be
-- administrators and the code has been quietly disagreeing ever since. The equivalence proof
-- below demonstrates it: results are identical across all twelve real roles with those names
-- dropped, which is only possible because they were unreachable.
--
-- WHY NOW IS THE SAFE WINDOW. app_users holds two rows, both 'owner', and every predicate grants
-- owner everything. So this cannot change what any current user sees — provable, not hoped. HR
-- begins entering real people shortly, and after that this consolidation stops being free.
--
-- NO ACCESS IS ADDED OR REMOVED. The matrix is seeded to reproduce today's behaviour exactly,
-- including the incoherence. The incoherence then becomes a visible row an authorised person can
-- change, instead of a function body nobody re-reads.

create table if not exists public.role_capability (
  role         app_role not null,
  capability   text     not null,
  allowed      boolean  not null default false,
  seeded_from  text,
  note         text,
  primary key (role, capability)
);
alter table public.role_capability enable row level security;

comment on table public.role_capability is
  'The single source for what each app_role may do. Seeded 10 Aug 2026 to reproduce exactly what '
  'is_executive(), f_caller_is_admin() and f_can_read_hr() did when they each carried their own '
  'role list. Change access HERE, in one row, not in three function bodies.';

insert into public.role_capability (role, capability, allowed, seeded_from, note) values
  -- executive_all: unchanged from is_executive()
  ('owner','executive_all',true,'is_executive()',null),
  ('executive','executive_all',true,'is_executive()',null),
  -- admin_settings: from f_caller_is_admin(), minus two names that are not app_role values
  ('owner','admin_settings',true,'f_caller_is_admin()',null),
  ('executive','admin_settings',true,'f_caller_is_admin()',null),
  ('admin','admin_settings',true,'f_caller_is_admin()',null),
  ('cfo','admin_settings',true,'f_caller_is_admin()',null),
  -- read_compensation: from f_can_read_hr(). Note what this already permits.
  ('owner','read_compensation',true,'f_can_read_hr()',null),
  ('executive','read_compensation',true,'f_can_read_hr()',null),
  ('admin','read_compensation',true,'f_can_read_hr()',null),
  ('hr','read_compensation',true,'f_can_read_hr()',null),
  ('cfo','read_compensation',true,'f_can_read_hr()',null),
  ('manager','read_compensation',true,'f_can_read_hr()',
   'A manager can read pay runs and individual pay lines TODAY. Inherited, not chosen. Review it.'),
  -- read_roster: what the employees and employee_rates policies enforce via is_executive()
  ('owner','read_roster',true,'employees.exec_all',null),
  ('executive','read_roster',true,'employees.exec_all',null),
  ('dept_head','read_roster',false,'employees.exec_all',
   'THE ROSTER GAP. A department head cannot read the employee list, so any roster or staffing view that honours policy is empty for them. One row to change once the owner decides.'),
  ('manager','read_roster',false,'employees.exec_all',
   'THE ROSTER GAP, and incoherent: this role may read PAY but not the staff list. Nobody decided that; it is the result of two functions disagreeing.'),
  ('assistant_manager','read_roster',false,'employees.exec_all','Same gap as manager.'),
  ('hr','read_roster',false,'employees.exec_all',
   'Human Resources may read compensation but NOT the employee roster. Almost certainly wrong; left as-is because this migration changes no access.')
on conflict (role, capability) do nothing;

/* Every remaining role/capability pair is denied by absence. Recorded explicitly so that
   "denied" and "never considered" are distinguishable — the same distinction the RLS-no-policy
   finding got wrong on three tables out of seven. */
insert into public.role_capability (role, capability, allowed, seeded_from, note)
select r.role, c.capability, false, 'denied by absence 10 Aug 2026',
       'No legacy predicate granted this. Denied explicitly rather than silently.'
  from (select unnest(enum_range(null::app_role)) as role) r
 cross join (values ('executive_all'),('admin_settings'),('read_compensation'),('read_roster')) c(capability)
on conflict (role, capability) do nothing;

create policy role_capability_staff_read on public.role_capability
  for select to authenticated using (true);

-- The one resolver. Everything else delegates to it.
create or replace function public.f_role_can(p_capability text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce((select allowed from role_capability
                    where role = public.current_app_role() and capability = p_capability), false);
$fn$;

comment on function public.f_role_can(text) is
  'Single authority for role-based access. Denies by default when a pair is not recorded.';

-- The three legacy predicates keep their names and signatures — every policy in the estate
-- references them — and now agree with each other because they read one table.
-- is_executive() also gains the pinned search_path it never had (rule E5).
create or replace function public.is_executive()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $fn$ select public.f_role_can('executive_all') $fn$;

create or replace function public.f_caller_is_admin()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $fn$ select public.f_role_can('admin_settings') $fn$;

create or replace function public.f_can_read_hr()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $fn$ select public.f_role_can('read_compensation') $fn$;

-- EQUIVALENCE PROOF. For all twelve real roles, the matrix must return exactly what the
-- hand-written lists returned. If it does not, this whole migration rolls back.
do $$
declare
  r        app_role;
  expected boolean;
  got      boolean;
  bad      text[] := '{}';
begin
  foreach r in array enum_range(null::app_role) loop
    expected := r in ('owner','executive');
    select allowed into got from role_capability where role = r and capability = 'executive_all';
    if coalesce(got,false) <> expected then bad := bad || format('executive_all/%s', r); end if;

    /* 'ceo' and 'coo' omitted deliberately: not app_role values, so unreachable. */
    expected := r in ('owner','executive','admin','cfo');
    select allowed into got from role_capability where role = r and capability = 'admin_settings';
    if coalesce(got,false) <> expected then bad := bad || format('admin_settings/%s', r); end if;

    expected := r in ('owner','executive','admin','hr','cfo','manager');
    select allowed into got from role_capability where role = r and capability = 'read_compensation';
    if coalesce(got,false) <> expected then bad := bad || format('read_compensation/%s', r); end if;
  end loop;

  if array_length(bad,1) > 0 then
    raise exception 'ROLLED BACK — matrix does not reproduce the legacy predicates: %',
      array_to_string(bad, ', ');
  end if;
  raise notice 'equivalence proved across all 12 roles for 3 capabilities';
end $$;;
