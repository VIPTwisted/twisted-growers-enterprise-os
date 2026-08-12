-- OFFBOARDING. The gap that carries a regulatory deadline: a departing agent's
-- CCC registration must be deactivated, and final pay in Massachusetts is due
-- the SAME DAY for an involuntary termination. Neither is a reminder — both are
-- dated obligations, so they get rows with due dates.

create table if not exists public.offboarding (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees(id) on delete cascade,
  kind              text not null check (kind in ('resignation','termination','layoff','end_of_season','death','other')),
  voluntary         boolean not null default true,
  notified_on       date,
  last_day          date not null,
  reason_code       text,
  reason_note       text,
  eligible_rehire   boolean,
  -- Massachusetts Wage Act: involuntary termination is paid in full on the day
  -- of discharge; a resignation by the next regular pay day.
  final_pay_due_on  date,
  final_pay_run_id  uuid references public.pay_runs(id) on delete set null,
  final_pay_paid_on date,
  pto_payout_hours  numeric(8,2),
  -- CCC: the agent registration must be deactivated in Metrc.
  ccc_deactivated_on date,
  metrc_removed_on   date,
  -- Everything the person holds.
  badge_returned     boolean not null default false,
  keys_returned      boolean not null default false,
  equipment_returned boolean not null default false,
  equipment_note     text,
  system_access_revoked_on date,
  exit_interview_on  date,
  exit_notes         text,
  handled_by         uuid references auth.users(id),
  status             text not null default 'open'
                     check (status in ('open','in_progress','complete','disputed')),
  created_at         timestamptz not null default now()
);
create index if not exists offb_open_idx on public.offboarding(status, last_day);

comment on table public.offboarding is
  'Leaving. final_pay_due_on encodes the Massachusetts Wage Act — same day for an '
  'involuntary discharge, next regular pay day for a resignation. ccc_deactivated_on '
  'is the regulatory step people forget: the agent registration must be stood down '
  'in Metrc, and an active registration for someone who left is a finding.';

create or replace function public.f_offboarding_due()
returns trigger language plpgsql as $$
begin
  if new.final_pay_due_on is null then
    new.final_pay_due_on := case when new.voluntary then null else new.last_day end;
  end if;
  return new;
end $$;

drop trigger if exists trg_offboarding_due on public.offboarding;
create trigger trg_offboarding_due before insert or update on public.offboarding
  for each row execute function public.f_offboarding_due();

create or replace view public.v_offboarding_open with (security_invoker = on) as
select o.id, e.employee_code, e.full_name, o.kind, o.voluntary, o.last_day,
       o.final_pay_due_on,
       (o.final_pay_paid_on is null and o.final_pay_due_on is not null
        and o.final_pay_due_on <= current_date)                as final_pay_overdue,
       (o.ccc_deactivated_on is null)                          as ccc_still_active,
       e.metrc_agent_badge, e.badge_expires,
       (not o.badge_returned or not o.keys_returned or not o.equipment_returned) as property_outstanding,
       (o.system_access_revoked_on is null)                    as access_still_live,
       o.status
from public.offboarding o
join public.employees e on e.id = o.employee_id
where o.status <> 'complete';

comment on view public.v_offboarding_open is
  'Every departure still carrying an obligation — unpaid final wages, a live CCC '
  'registration, unreturned property, or system access that was never revoked.';

-- ── AGENT HR, registered with the owner's ruling on its face. ────────
insert into public.agent_registry
  (agent_key, display_name, kind, what_it_watches, why_it_matters, owner,
   expected_every_mins, evidence_table, enabled, added_on)
select 'agent_hr', 'Human Resources Agent', 'drafting',
  'Attendance points and escalations, licence and training expiry, document and '
  'handbook standing, schedule drafts, open shifts and coverage gaps, onboarding '
  'and offboarding obligations, time-off requests, incidents.',
  'OWNER RULING, 8 Aug 2026: ALL HR REQUIRES HUMAN. This agent drafts and never '
  'sends. Every output lands in hr_review_queue for a person to send, edit, defer '
  'or ignore — reminders included. It holds no standing approval and no '
  'pre-authorised action. It is NOT an authority on Massachusetts employment law '
  'or CCC regulation: it drafts from our own written policy, cites the clause in '
  'policy_basis, and records agent_confidence including "unsure". An item with no '
  'policy basis is an opinion, and an opinion about someone''s employment is not '
  'actionable.',
  'Human Resources', 60, 'hr_review_queue', true, current_date
where not exists (select 1 from public.agent_registry where agent_key = 'agent_hr');

alter table public.offboarding enable row level security;
create policy offb_read on public.offboarding for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy offb_write on public.offboarding for all to authenticated
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());
grant select on public.offboarding, public.v_offboarding_open to authenticated;
grant insert, update on public.offboarding to authenticated;

insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Offboarding',50,'clip','offboarding','offboarding',
  'Departures and every obligation that outlives them — final pay under the Massachusetts Wage Act, CCC registration stood down in Metrc, property returned, access revoked.',
  true,'#ff4245',true,'hr','People','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Open Obligations',51,'shield','offboarding_open','v_offboarding_open',
  'Departures still carrying an obligation: unpaid final wages, a live agent registration for someone who left, unreturned property, or access never revoked.',
  true,'#ff4245',true,'hr','People','report','not_applicable',null,'snapshot')
on conflict do nothing;

select
 (select count(*) from public.employees where manager_id is not null) as have_manager,
 (select count(*) from public.employees where status::text='active')  as active_staff,
 (select count(*) from public.agent_registry where agent_key='agent_hr') as agent_hr_registered,
 (select count(*) from public.nav_registry where enabled and surface='hr') as hr_pages;;
