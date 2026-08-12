-- Owner, 9 Aug 2026: not every employee is required to clock in. HR toggles
-- who is, in settings.
--
-- This is a correctness fix, not a preference. Today an exempt salaried person
-- shows as "no PIN", counts against the readiness tile, and would accrue
-- attendance points for arriving at 9:15. Every one of those is wrong for
-- someone who was never on a clock.

alter table public.employees
  add column if not exists requires_clock_in boolean not null default true,
  add column if not exists clock_exempt_reason text;

comment on column public.employees.requires_clock_in is
  'Whether this person punches a clock. HR sets it. False means they are not '
  'counted in attendance, raise no occurrences, need no PIN, and are excluded '
  'from timesheet coverage — because none of those measure anything real for '
  'somebody who was never on a clock.';
comment on column public.employees.clock_exempt_reason is
  'Why they are exempt — salaried exempt, owner, contractor, off-site. Recorded '
  'so the exemption is a decision with a reason, not an unexplained blank.';

-- Sensible starting point from what is already known: anyone on hours_basis
-- 'exempt' is not on a clock. Everyone else stays required until HR says
-- otherwise. Defaulting the other way would silently stop measuring people.
update public.employees
   set requires_clock_in = false,
       clock_exempt_reason = coalesce(clock_exempt_reason, 'Salaried exempt — set from hours_basis on 9 Aug 2026')
 where hours_basis = 'exempt' and requires_clock_in;

-- ── Attendance must not fire for someone off the clock. ──────────────
create or replace function public.f_guard_occurrence_requires_clock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_req boolean; v_name text;
begin
  select requires_clock_in, full_name into v_req, v_name
  from public.employees where id = new.employee_id;

  if v_req is false then
    raise exception
      'Cannot raise an attendance occurrence for %: they are not required to clock in. Change it in Settings if that is wrong.',
      v_name using errcode='23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_occurrence_requires_clock on public.attendance_occurrences;
create trigger trg_occurrence_requires_clock
  before insert on public.attendance_occurrences
  for each row execute function public.f_guard_occurrence_requires_clock();

comment on function public.f_guard_occurrence_requires_clock is
  'Refuses an attendance occurrence against anyone not on a clock. Lateness has '
  'no meaning without a scheduled start, and points accrued against an exempt '
  'salaried person would eventually escalate to a warning nobody could defend.';

-- ── Who is actually on a clock, and who is ready to use one. ─────────
create or replace view public.v_clock_readiness with (security_invoker = on) as
select e.id as employee_id, e.employee_code, e.full_name, e.login_id,
       coalesce(d.name,'Unassigned') as department,
       e.hours_basis, e.requires_clock_in, e.clock_exempt_reason,
       (e.pin_hash is not null)  as has_pin,
       (e.badge_code is not null) as has_badge,
       case
         when not e.requires_clock_in then 'not on a clock'
         when e.pin_hash is null and e.badge_code is null then 'CANNOT CLOCK IN'
         when e.pin_hash is null then 'badge only'
         else 'ready'
       end as readiness
from public.employees e
left join public.departments d on d.id = e.primary_department_id
where e.status::text = 'active';

comment on view public.v_clock_readiness is
  'Who is required to clock in, and whether they can. "CANNOT CLOCK IN" counts '
  'only people who are actually required to — an exempt salaried person without '
  'a PIN is not a gap, and reporting them as one is how a real gap gets lost in '
  'the noise.';

insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  module, date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Clock Readiness',68,'clock','clock_readiness','v_clock_readiness',
  'Who is required to clock in and whether they can. Exempt staff are shown as "not on a clock" rather than counted as a gap — an exempt person without a PIN is not a problem.',
  true,'#2df26a',false,'hr','Live','report','hr','not_applicable',null,'snapshot')
on conflict do nothing;

grant select on public.v_clock_readiness to authenticated;

select requires_clock_in, count(*) from public.employees
where status::text='active' group by 1;;
