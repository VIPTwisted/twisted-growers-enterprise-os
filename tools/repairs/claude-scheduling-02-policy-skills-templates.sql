-- Scheduling foundation, part 2 of 3 — the rules live in tables, not in code.
-- Owner, 12 Sep 2026: floater = trained or being trained in more than one department; skill levels
-- in_training / trained / can_lead with a re-cert date where one applies; sign-off = CEO, CFO, HR for
-- now; "enter what you recommend, CFO or HR to revise later"; everything editable in Settings.
--
--   1. scheduling_policy  — one row of rules (sign-off roles, horizons, rest, floater rule …) with a
--                           history table so every revision keeps who/when/what.
--   2. f_can_post_schedule — reads signoff_roles; f_post_schedule now uses it, and also converts the
--                           draft's timestamptz shift times into local wall-clock time (the old cast
--                           took the UTC time-of-day: an 08:00 ET shift would have posted as 12:00).
--   3. employee_department_skill — the training matrix; v_employee_skill_matrix, v_floaters,
--                           v_staff_without_department. Seeded 'trained' from each primary department.
--   4. shift_templates    — Day · Wave 1 / Day · Wave 2 (08:00–16:30, 30 min unpaid meal), the two
--                           break waves from the owner's 10 Sep ruling; the 8 Aug company-wide window
--                           is retired. v_on_the_floor picks ONE window per person (it fanned out).
--   5. zone_staffing_requirements — a recommended headcount per zone per weekday, total 17 = the 17
--                           people who have a primary department today. HR revises.

-- 1 ─ scheduling_policy ───────────────────────────────────────────────────────────────────────
create table if not exists public.scheduling_policy (
  id                         boolean primary key default true check (id),
  facility_tz                text not null default 'America/New_York',
  signoff_roles              text[] not null default '{owner,executive,cfo,hr}',
  draft_cadence              text not null default 'weekly' check (draft_cadence in ('weekly','semi_weekly','monthly')),
  draft_horizon_days         integer not null default 14 check (draft_horizon_days between 7 and 62),
  post_horizon_days          integer not null default 7 check (post_horizon_days between 1 and 62),
  min_rest_hours             numeric not null default 10 check (min_rest_hours between 0 and 24),
  max_consecutive_days       integer not null default 6 check (max_consecutive_days between 1 and 14),
  in_training_needs_partner  boolean not null default true,
  floater_rule               text not null default 'trained_or_in_training_in_2_or_more_departments',
  primary_department_first   boolean not null default true,
  avoid_overtime             boolean not null default true,
  swap_needs_signoff         boolean not null default true,
  claim_with_ot_needs_signoff boolean not null default true,
  callout_cover_order        text[] not null default '{skill,hours_to_ot,availability}',
  weekend_zones              text[] not null default '{flower_rooms,veg_mother_clone}',
  block_post_on_conflict     boolean not null default false,
  default_shift_template_id  uuid references public.shift_templates(id),
  note                       text,
  updated_by                 uuid,
  updated_at                 timestamptz not null default now()
);
comment on table public.scheduling_policy is
  'The scheduling rules. One row. Call-out notice hours stay in attendance_policy.notice_hours_required (2 h as at 8 Aug 2026). Revisions are kept in scheduling_policy_history.';

insert into public.scheduling_policy (id, note)
values (true, 'Claude''s recommendation 12 Sep 2026 at the owner''s direction; CFO or HR to revise in Settings. Draft two weeks, post one; 10 h rest between shifts; six days in a row at most; a person in training is never alone in a zone; primaries placed before floaters; overtime only when nobody else fits.')
on conflict (id) do nothing;

create table if not exists public.scheduling_policy_history (
  id          bigint generated always as identity primary key,
  changed_at  timestamptz not null default now(),
  changed_by  uuid,
  before      jsonb not null,
  after       jsonb not null
);
create or replace function public.f_scheduling_policy_history() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  insert into scheduling_policy_history (changed_by, before, after) values (auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end $$;
drop trigger if exists scheduling_policy_history on public.scheduling_policy;
create trigger scheduling_policy_history before update on public.scheduling_policy
  for each row execute function public.f_scheduling_policy_history();

alter table public.scheduling_policy enable row level security;
alter table public.scheduling_policy_history enable row level security;
drop policy if exists scheduling_policy_read on public.scheduling_policy;
create policy scheduling_policy_read on public.scheduling_policy for select using (true);
drop policy if exists scheduling_policy_write on public.scheduling_policy;
create policy scheduling_policy_write on public.scheduling_policy for update
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());
drop policy if exists scheduling_policy_history_read on public.scheduling_policy_history;
create policy scheduling_policy_history_read on public.scheduling_policy_history for select using (public.f_can_read_hr());

-- 2 ─ sign-off gate reads the policy; f_post_schedule uses it and posts local wall-clock times ──
create or replace function public.f_can_post_schedule() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.current_app_role()::text = any (coalesce((select signoff_roles from public.scheduling_policy), '{owner}'::text[]))
$$;

create or replace function public.f_post_schedule(p_draft_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_d public.schedule_drafts%rowtype; v_n int := 0; v_open int := 0; v_tz text;
begin
  if not public.f_can_post_schedule() then
    raise exception 'Only a scheduling sign-off role (Settings › Scheduling) may post a schedule.'
      using errcode = '42501';
  end if;
  select facility_tz into v_tz from public.scheduling_policy;
  v_tz := coalesce(v_tz, 'America/New_York');

  select * into v_d from public.schedule_drafts where id = p_draft_id;
  if v_d.id is null then raise exception 'No such draft.'; end if;
  if v_d.status = 'posted' then raise exception 'That draft is already posted.'; end if;
  if coalesce((select block_post_on_conflict from public.scheduling_policy), false)
     and exists (select 1 from public.schedule_draft_lines l where l.draft_id = p_draft_id and l.conflict is not null and not l.is_open_shift) then
    raise exception 'This draft still has conflicts and Settings › Scheduling blocks posting with conflicts. Resolve every red cell or turn it into an open shift.';
  end if;

  /* Replace only the window this draft covers, only for its department.
     Anything outside is untouched — posting Packaging must not wipe Cultivation. */
  delete from public.employee_schedules s
   where s.work_date between v_d.covers_from and v_d.covers_to
     and (v_d.department_id is null or s.department_id = v_d.department_id);

  insert into public.employee_schedules
    (employee_id, work_date, shift_template_id, department_id, zone, zone_id, planned_start, planned_end, status, note)
  select l.employee_id, l.work_date, l.shift_template_id,
         coalesce(l.department_id, v_d.department_id), z.name, l.zone_id,
         (l.planned_start at time zone v_tz)::time, (l.planned_end at time zone v_tz)::time, 'scheduled', l.note
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
end $function$;

-- 3 ─ the training matrix ─────────────────────────────────────────────────────────────────────
create table if not exists public.employee_department_skill (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references public.employees(id),
  department_id        uuid not null references public.departments(id),
  level                text not null check (level in ('in_training','trained','can_lead')),
  trained_on           date,
  trained_by           uuid references public.employees(id),
  verified_by          uuid references public.employees(id),
  verified_on          date,
  certification        text,
  expires              date,
  evidence_document_id uuid references public.hr_documents(id),
  note                 text,
  source               text not null default 'manual',
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_by           uuid,
  updated_at           timestamptz,
  retired_at           timestamptz,
  retired_why          text
);
create unique index if not exists employee_department_skill_live_uidx
  on public.employee_department_skill (employee_id, department_id) where retired_at is null;
comment on table public.employee_department_skill is
  'Who may be placed where. One live row per employee per department: in_training / trained / can_lead, who trained and verified it, and an expiry where a certification lapses. The drafter places nobody without a live row here. An employee''s primary department comes from employees.primary_department_id and is not repeated.';

alter table public.employee_department_skill enable row level security;
drop policy if exists eds_read on public.employee_department_skill;
create policy eds_read on public.employee_department_skill for select
  using (public.f_can_read_hr() or employee_id = public.f_my_employee_id());
drop policy if exists eds_write on public.employee_department_skill;
create policy eds_write on public.employee_department_skill for all
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());

create or replace function public.f_employee_department_skill_touch() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.expires is not null and new.expires < current_date and new.level <> 'in_training' then
    -- a lapsed certification is not "trained"; the row stays so the history is visible
    new.note := coalesce(new.note || ' · ', '') || 'certification lapsed ' || new.expires::text;
  end if;
  return new;
end $$;
drop trigger if exists employee_department_skill_touch on public.employee_department_skill;
create trigger employee_department_skill_touch before insert or update on public.employee_department_skill
  for each row execute function public.f_employee_department_skill_touch();

-- Seed: everyone with a primary department is 'trained' in it. HR verifies; the source says it was seeded.
insert into public.employee_department_skill (employee_id, department_id, level, source, note)
select e.id, e.primary_department_id, 'trained', 'seeded_from_primary_department_2026-09-12',
       'Seeded from the primary department on file. HR to confirm trained_on / trained_by and add any other departments this person is trained or training in.'
from public.employees e
where e.primary_department_id is not null
  and not exists (select 1 from public.employee_department_skill s where s.employee_id = e.id and s.department_id = e.primary_department_id and s.retired_at is null);

create or replace view public.v_employee_skill_matrix as
with live as (
  select s.* from public.employee_department_skill s
  where s.retired_at is null and (s.expires is null or s.expires >= current_date)
),
per_emp as (
  select e.id as employee_id, count(l.id) as departments_qualified
  from public.employees e left join live l on l.employee_id = e.id
  group by e.id
)
select e.id as employee_id, e.employee_code, e.full_name, e.status::text as employment,
       d.id as department_id, d.name as department,
       (e.primary_department_id = d.id) as is_primary,
       l.level, l.trained_on, l.trained_by, l.verified_by, l.verified_on, l.certification, l.expires, l.source,
       pe.departments_qualified,
       (pe.departments_qualified >= 2) as is_floater,
       case
         when l.level is null then 'not trained here'
         when l.level = 'in_training' then 'in training — never alone in a zone'
         when l.level = 'trained' then 'may be placed'
         else 'may be placed and may lead'
       end as placement
from public.employees e
cross join public.departments d
left join live l on l.employee_id = e.id and l.department_id = d.id
join per_emp pe on pe.employee_id = e.id
where d.active
order by e.full_name, d.sort;

create or replace view public.v_floaters as
select m.employee_id, m.employee_code, m.full_name, m.employment, m.departments_qualified,
       string_agg(m.department || ' (' || m.level || case when m.is_primary then ', primary' else '' end || ')', ', ' order by m.is_primary desc, m.department) as qualified_in
from public.v_employee_skill_matrix m
where m.is_floater and m.level is not null
group by m.employee_id, m.employee_code, m.full_name, m.employment, m.departments_qualified
order by m.departments_qualified desc, m.full_name;
comment on view public.v_floaters is 'Owner ruling 12 Sep 2026: a floater is trained or in training in two or more departments.';

create or replace view public.v_staff_without_department as
select e.id as employee_id, e.employee_code, e.full_name, e.status::text as employment, e.hired_on,
       'No primary department on file — cannot be drafted anywhere until HR assigns one in Settings.'::text as why_it_matters
from public.employees e
where e.primary_department_id is null and e.status = 'active'
order by e.full_name;

-- 4 ─ shift templates and the two break waves ──────────────────────────────────────────────────
insert into public.shift_templates (name, start_time, end_time, block_minutes, break_minutes, lunch_minutes, granularity_minutes, min_block_minutes, active)
select v.name, v.s, v.e, 510, 0, 30, 15, 240, true
from (values ('Day · Wave 1', time '08:00', time '16:30'), ('Day · Wave 2', time '08:00', time '16:30')) v(name, s, e)
where not exists (select 1 from public.shift_templates t where t.name = v.name);

insert into public.break_windows (name, kind, starts_at, ends_at, minutes, paid, shift_template_id, staggered, active, note)
select v.name, 'meal', v.s, v.e, 30, false, t.id, true, true,
       'Owner ruling 10 Sep 2026 (#185, facility.ts BREAK_WAVES): two unpaid meal waves; the other wave stays on the floor. Recommended start 08:00 — HR to revise.'
from (values ('Wave 1', time '12:00', time '12:30', 'Day · Wave 1'), ('Wave 2', time '13:30', time '14:00', 'Day · Wave 2')) v(name, s, e, tmpl)
join public.shift_templates t on t.name = v.tmpl
where not exists (select 1 from public.break_windows b where b.name = v.name);

update public.break_windows
   set active = false,
       note = coalesce(note, '') || ' · Retired 12 Sep 2026: superseded by Wave 1 / Wave 2 (owner ruling 10 Sep 2026).'
 where name = 'Company meal break' and active and shift_template_id is null;

update public.scheduling_policy p
   set default_shift_template_id = (select id from public.shift_templates where name = 'Day · Wave 1')
 where p.default_shift_template_id is null;

-- One break window per person on the floor: the shift's own, else the zone's, else the department's, else company-wide.
create or replace view public.v_on_the_floor as
select t.id as time_entry_id, e.id as employee_id, e.employee_code, e.full_name,
       coalesce(d.name, 'Unassigned') as department,
       coalesce(btrim(s.zone), 'No zone') as zone,
       st.name as shift, t.clock_in, t.work_date, t.source, t.late_minutes, t.early_minutes,
       pd.label as device,
       round(extract(epoch from now() - t.clock_in) / 3600.0, 2) as hours_so_far,
       s.work_date + s.planned_start as planned_start,
       s.work_date + s.planned_end as planned_end,
       round(extract(epoch from (s.work_date + s.planned_end) - (now() at time zone tz.facility_tz)) / 3600.0, 2) as hours_left_scheduled,
       r.rate,
       round(extract(epoch from now() - t.clock_in) / 3600.0 * r.rate * (1 + coalesce(r.burden_pct, 0)), 2) as cost_so_far_loaded,
       bw.name as break_window, bw.starts_at as break_from, bw.ends_at as break_to,
       ((now() at time zone tz.facility_tz)::time >= bw.starts_at and (now() at time zone tz.facility_tz)::time <= bw.ends_at) as on_break_now,
       e.badge_expires,
       (e.badge_expires is not null and e.badge_expires < current_date) as licence_lapsed
from public.time_entries t
join public.employees e on e.id = t.employee_id
cross join lateral (select coalesce((select facility_tz from public.scheduling_policy), 'America/New_York') as facility_tz) tz
left join public.employee_schedules s on s.employee_id = t.employee_id and s.work_date = t.work_date
left join public.shift_templates st on st.id = s.shift_template_id
left join public.departments d on d.id = coalesce(s.department_id, e.primary_department_id)
left join public.punch_devices pd on pd.id = t.device_id
left join lateral (
  select b.* from public.break_windows b
  where b.active
    and (b.shift_template_id is null or b.shift_template_id = s.shift_template_id)
    and (b.zone_id is null or b.zone_id = s.zone_id)
    and (b.department_id is null or b.department_id = coalesce(s.department_id, e.primary_department_id))
  order by (b.shift_template_id is not null) desc, (b.zone_id is not null) desc, (b.department_id is not null) desc, b.starts_at
  limit 1
) bw on true
left join lateral (
  select r2.rate, r2.burden_pct from public.employee_rates r2
  where r2.employee_id = t.employee_id and r2.effective_from <= t.work_date and (r2.effective_to is null or r2.effective_to >= t.work_date)
  order by r2.effective_from desc limit 1
) r on true
where t.clock_in is not null and t.clock_out is null;

-- 5 ─ recommended staffing per zone: 17 heads on weekdays = the 17 people with a primary department ──
insert into public.zone_staffing_requirements (zone_id, department_id, weekday, shift, headcount_required, hours_per_head, driver, note, effective_from)
select z.id, z.department_id, wd, 'Day', v.heads, 8.0, 'manual',
       'Claude recommendation 12 Sep 2026: spread of today''s primary headcount per department across its zones. Revise in Settings › Staffing.',
       date '2026-09-14'
from (values
  ('flower_rooms', 3), ('veg_mother_clone', 1), ('dry_cure', 1),
  ('trim', 2),
  ('extraction_hydro', 1), ('extraction_solventless', 1), ('production_room', 0), ('frozen_biomass', 0),
  ('grind', 0), ('flower_packaging', 2), ('packaging_supplies', 0),
  ('pre_rolls', 5),
  ('vaults', 0), ('dock_inventory', 1),
  ('qa_quarantine', 0)
) v(zone_key, heads)
join public.zones z on z.zone_key = v.zone_key
cross join generate_series(1, 5) wd
where not exists (select 1 from public.zone_staffing_requirements r where r.zone_id = z.id and r.weekday = wd);

-- Weekend: plants are watered seven days. One head in the flower rooms, Saturday and Sunday.
insert into public.zone_staffing_requirements (zone_id, department_id, weekday, shift, headcount_required, hours_per_head, driver, note, effective_from)
select z.id, z.department_id, wd, 'Day', 1, 8.0, 'manual',
       'Claude recommendation 12 Sep 2026: weekend watering/IPM cover. Revise in Settings › Staffing.', date '2026-09-14'
from public.zones z cross join (values (0), (6)) w(wd)
where z.zone_key = 'flower_rooms'
  and not exists (select 1 from public.zone_staffing_requirements r where r.zone_id = z.id and r.weekday = w.wd);
