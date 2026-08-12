-- Three punch sources, one canonical table. Wall tablet, phone, and
-- payroll import all land in time_entries through a single function, so
-- late detection and occurrence creation cannot be bypassed by picking a
-- different door. Additive only.

-- ── 1. Provenance on every punch ─────────────────────────────────────
alter table public.time_entries
  add column if not exists source text not null default 'manual'
    check (source in ('kiosk','mobile','web','payroll_import','manual')),
  add column if not exists device_id uuid,
  add column if not exists punch_lat numeric(9,6),
  add column if not exists punch_lon numeric(9,6),
  add column if not exists punch_accuracy_m numeric(6,1),
  add column if not exists source_ref text,
  add column if not exists late_minutes integer,
  add column if not exists created_at timestamptz not null default now();

comment on column public.time_entries.source is
  'Which door this punch came through. Every source routes via f_punch() so '
  'lateness and occurrences are computed identically regardless of door.';
comment on column public.time_entries.source_ref is
  'External id when source=payroll_import — the payroll provider''s own punch id. '
  'Unique per provider so a re-import cannot double-post.';

create unique index if not exists time_entries_source_ref_key
  on public.time_entries(source, source_ref) where source_ref is not null;
create index if not exists time_entries_open_idx
  on public.time_entries(employee_id, work_date) where clock_out is null;

-- ── 2. Wall tablets. A device is a named, revocable thing. ───────────
create table if not exists public.punch_devices (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  location      text,
  device_token  text not null unique,
  active        boolean not null default true,
  last_seen_at  timestamptz,
  geofence_lat  numeric(9,6),
  geofence_lon  numeric(9,6),
  geofence_m    integer default 150,
  created_at    timestamptz not null default now()
);
comment on table public.punch_devices is
  'Registered wall terminals. Revoke by setting active=false — the token stops '
  'working immediately, no redeploy.';

alter table public.punch_devices enable row level security;
drop policy if exists punch_dev_admin on public.punch_devices;
create policy punch_dev_admin on public.punch_devices
  for all to authenticated
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());

-- ── 3. Attendance policy, editable without a deploy ──────────────────
create table if not exists public.attendance_policy (
  id                    boolean primary key default true check (id),
  grace_minutes         integer not null default 5,
  points_late           numeric(3,1) not null default 0.5,
  points_absent_notice  numeric(3,1) not null default 1.0,
  points_absent_no_notice numeric(3,1) not null default 2.0,
  points_no_call        numeric(3,1) not null default 3.0,
  points_left_early     numeric(3,1) not null default 0.5,
  verbal_at             numeric(3,1) not null default 3.0,
  written_at            numeric(3,1) not null default 4.0,
  final_at              numeric(3,1) not null default 6.0,
  review_at             numeric(3,1) not null default 8.0,
  notice_hours_required integer not null default 2,
  updated_at            timestamptz not null default now()
);
insert into public.attendance_policy (id) values (true) on conflict (id) do nothing;

alter table public.attendance_policy enable row level security;
drop policy if exists att_pol_read  on public.attendance_policy;
drop policy if exists att_pol_write on public.attendance_policy;
create policy att_pol_read  on public.attendance_policy for select to authenticated using (true);
create policy att_pol_write on public.attendance_policy for all    to authenticated
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());

-- ── 4. The single door. Every source calls this. ─────────────────────
create or replace function public.f_punch(
  p_employee_id uuid,
  p_kind        text,                       -- 'in' | 'out'
  p_source      text default 'web',
  p_device_id   uuid default null,
  p_lat         numeric default null,
  p_lon         numeric default null,
  p_accuracy_m  numeric default null,
  p_at          timestamptz default now()
) returns table (
  entry_id uuid, action text, late_minutes integer,
  occurrence_id uuid, message text
)
language plpgsql security definer set search_path = public as $$
declare
  v_date        date := (p_at at time zone 'America/New_York')::date;
  v_open        public.time_entries%rowtype;
  v_planned     time;
  v_grace       integer;
  v_late        integer := null;
  v_points      numeric(3,1);
  v_occ         uuid := null;
  v_entry       uuid;
begin
  if p_kind not in ('in','out') then
    raise exception 'f_punch: p_kind must be in or out, got %', p_kind;
  end if;

  select grace_minutes, points_late into v_grace, v_points
  from public.attendance_policy where id;

  select * into v_open from public.time_entries
  where employee_id = p_employee_id and clock_out is null
  order by clock_in desc limit 1;

  -- ── CLOCK IN ────────────────────────────────────────────────────
  if p_kind = 'in' then
    if v_open.id is not null then
      return query select v_open.id, 'already_in'::text, null::integer, null::uuid,
        'Already clocked in. Clock out first.'::text;
      return;
    end if;

    select planned_start into v_planned
    from public.employee_schedules
    where employee_id = p_employee_id and work_date = v_date
    order by planned_start limit 1;

    if v_planned is not null then
      v_late := greatest(0, ceil(extract(epoch from
        ((p_at at time zone 'America/New_York')::time - v_planned)) / 60.0)::integer);
      if v_late <= v_grace then v_late := 0; end if;
    end if;

    insert into public.time_entries
      (employee_id, work_date, clock_in, source, device_id,
       punch_lat, punch_lon, punch_accuracy_m, late_minutes,
       exception_code)
    values
      (p_employee_id, v_date, p_at, p_source, p_device_id,
       p_lat, p_lon, p_accuracy_m, v_late,
       case when coalesce(v_late,0) > 0 then 'late' else null end)
    returning id into v_entry;

    -- A late punch raises an occurrence that starts life needing an
    -- explanation. The employee is challenged at the clock; HR decides.
    if coalesce(v_late,0) > 0 then
      insert into public.attendance_occurrences
        (employee_id, work_date, kind, minutes, points, status, time_entry_id)
      values
        (p_employee_id, v_date, 'late', v_late, v_points,
         'awaiting_explanation', v_entry)
      returning id into v_occ;
    end if;

    return query select v_entry, 'clocked_in'::text, v_late, v_occ,
      case when coalesce(v_late,0) > 0
        then format('Clocked in %s minutes late. This is an attendance occurrence '
                    'worth %s points and may result in a disciplinary warning. '
                    'If you have an excusable reason, state it now.', v_late, v_points)
        else 'Clocked in.' end::text;
    return;
  end if;

  -- ── CLOCK OUT ───────────────────────────────────────────────────
  if v_open.id is null then
    return query select null::uuid, 'not_in'::text, null::integer, null::uuid,
      'No open punch to close.'::text;
    return;
  end if;

  update public.time_entries
     set clock_out = p_at,
         productive_hours = round(
           (extract(epoch from (p_at - clock_in)) / 3600.0)
           - coalesce(unpaid_lunch_min,0) / 60.0, 2)
   where id = v_open.id
  returning id into v_entry;

  return query select v_entry, 'clocked_out'::text, v_open.late_minutes, null::uuid,
    'Clocked out.'::text;
end $$;

revoke all on function public.f_punch(uuid,text,text,uuid,numeric,numeric,numeric,timestamptz) from public;
grant execute on function public.f_punch(uuid,text,text,uuid,numeric,numeric,numeric,timestamptz) to authenticated;

comment on function public.f_punch is
  'The only way a punch enters the system. Kiosk, mobile, web and payroll import '
  'all call this, so lateness, grace and occurrence creation are computed once. '
  'Grace and points come from attendance_policy, editable without a deploy.';

-- ── 5. Self-service punching, still through the function ─────────────
grant select, insert, update on public.time_entries to authenticated;

drop policy if exists te_self_read on public.time_entries;
drop policy if exists te_hr_read   on public.time_entries;
drop policy if exists te_hr_write  on public.time_entries;
alter table public.time_entries enable row level security;

create policy te_self_read on public.time_entries
  for select to authenticated
  using (employee_id = public.f_my_employee_id());
create policy te_hr_read on public.time_entries
  for select to authenticated using (public.f_can_read_hr());
create policy te_hr_write on public.time_entries
  for all to authenticated
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());;
