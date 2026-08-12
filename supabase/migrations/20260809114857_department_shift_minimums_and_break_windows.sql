-- Minimum staffing can be set per ZONE or per DEPARTMENT (or both), per
-- shift, per weekday. HR sets it; nothing is compiled in.
alter table public.zone_staffing_requirements
  add column if not exists department_id     uuid references public.departments(id) on delete cascade,
  add column if not exists shift_template_id uuid references public.shift_templates(id) on delete set null,
  alter column zone_id drop not null;

do $$ begin
  alter table public.zone_staffing_requirements
    add constraint zsr_target_ck check (zone_id is not null or department_id is not null);
exception when duplicate_object then null; end $$;

comment on column public.zone_staffing_requirements.department_id is
  'Set the minimum for a whole department rather than a single zone. A row may '
  'name a zone, a department, or both — both means "this zone, for this department".';

-- Break and meal windows. Massachusetts requires a 30-minute meal break on a
-- shift over six hours; the window itself is the company''s choice, so it is a
-- row. Change the time here and every schedule follows.
create table if not exists public.break_windows (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kind           text not null default 'meal' check (kind in ('meal','rest','other')),
  starts_at      time not null,
  ends_at        time not null,
  minutes        integer not null check (minutes between 5 and 120),
  paid           boolean not null default false,
  department_id  uuid references public.departments(id) on delete cascade,
  zone_id        uuid references public.zones(id) on delete cascade,
  shift_template_id uuid references public.shift_templates(id) on delete cascade,
  staggered      boolean not null default false,
  active         boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists breakwin_active_idx on public.break_windows(active, department_id);
comment on table public.break_windows is
  'When breaks are taken. Null department and zone means it applies everywhere. '
  'staggered=true means the window is a range within which people go in turns '
  'rather than everyone at once — needed when a line cannot stop.';

-- The company''s current practice, stated by the owner on 8 Aug 2026. A row,
-- not a constant: change the time here and nothing needs a deploy.
insert into public.break_windows (name, kind, starts_at, ends_at, minutes, paid, note)
select 'Company meal break', 'meal', time '13:00', time '13:30', 30, false,
       'Current company-wide practice as at 8 August 2026. Massachusetts requires a '
       '30-minute meal break on a shift over six hours.'
where not exists (select 1 from public.break_windows where name = 'Company meal break');

alter table public.break_windows enable row level security;
drop policy if exists breakwin_read on public.break_windows;
create policy breakwin_read on public.break_windows for select to authenticated using (true);
drop policy if exists breakwin_write on public.break_windows;
create policy breakwin_write on public.break_windows for all to authenticated
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());
grant select on public.break_windows to authenticated;
grant insert, update, delete on public.break_windows to authenticated;

-- Surface all of it.
insert into public.nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref,
   description, enabled, color, admin_only, surface, subcategory, page_kind,
   date_policy, default_range, range_kind)
values
  ('Human Resources',7,'Employee Manual & Documents',12,'clip','hr_documents','hr_documents',
   'The manual, policies, SOPs and addendums. Revising a document takes a new version and asks everyone to sign again — old signatures stay bound to the version they signed.',
   true,'#2df26a',false,'hr','Documents','report','not_applicable',null,'snapshot'),
  ('Human Resources',7,'Who Has Read & Signed',13,'check','doc_compliance','v_document_compliance',
   'Every person who must read every live document, and how far they got — not started, in progress, read, signed or overdue. This is the record you hand an inspector.',
   true,'#2df26a',false,'hr','Documents','report','not_applicable',null,'snapshot'),
  ('Human Resources',7,'Incidents',14,'shield','hr_incidents','hr_incidents',
   'Injuries, near misses, spills, equipment faults and security events. Flags what is OSHA recordable and what the Commission must be told.',
   true,'#ff4245',false,'hr','Safety & Compliance','report','auto','this_month_td','activity'),
  ('Human Resources',7,'Compliance Requirements',15,'shield','compliance_requirements','compliance_requirements',
   'What each person must hold — agent registration, gowning, forklift. Anything marked as blocking work stops that person being scheduled once it expires.',
   true,'#e2bd63',false,'hr','Safety & Compliance','report','not_applicable',null,'snapshot'),
  ('Human Resources',7,'Employee Compliance',16,'shield','employee_compliance','employee_compliance',
   'Per-person status against every requirement, with expiry dates and the evidence held.',
   true,'#e2bd63',false,'hr','Safety & Compliance','report','not_applicable',null,'snapshot'),
  ('Human Resources',7,'Break Windows',17,'clock','break_windows','break_windows',
   'When breaks are taken, by department, zone or shift. Change the time here and every schedule follows.',
   true,'#57a9ff',false,'hr','Time & Scheduling','report','not_applicable',null,'snapshot')
on conflict do nothing;

select count(*) filter (where surface='hr') as hr_pages from public.nav_registry where enabled;;
