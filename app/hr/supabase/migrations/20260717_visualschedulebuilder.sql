--- 20260717_visualschedulebuilder.sql
--- Visual Schedule Builder: replace the localStorage 'vip_sched_v2_*' pseudo-
--- datastore with REAL writes to the existing public.shifts table.
---
--- Reads already real and REUSED unchanged by the screen:
---   * get_roster(uuid[], uuid)          — staff pool + role + keyholder (live).
---   * get_team_availability(uuid[])     — per-person availability_json (live).
--- get_week_schedule exists but does NOT expose person_id / zone / shift_id in a
--- shape the builder can round-trip (verified via its call sites), so this screen
--- reads via a dedicated builder RPC below that returns exactly what assign/remove
--- need. No fake data, no seeds. Idempotent. SECURITY DEFINER (RLS on shifts
--- blocks anon direct writes).
---
--- shifts columns (existing, confirmed via post_open_shift / callout tracker):
---   id, person_id (nullable), node_id, shift_date, start_time, end_time,
---   shift_type, status, notes, created_at.  We add an optional zone column.

-- ── 0) Optional per-assignment zone on the shift row ─────────────────────────
alter table public.shifts add column if not exists zone text;

-- ── 1) Read: one published week for the builder grid ─────────────────────────
-- Returns every scheduled (non-cancelled, filled) shift for the week across the
-- given nodes, enriched with the person, their role (assignment-scoped to the
-- shift node when possible) and a derived keyholder flag matching the UI regex.
create or replace function public.vsb_get_schedule(
  p_node_ids   uuid[],
  p_week_start date,
  p_actor      uuid default null
)
returns table (
  shift_id   uuid,
  node_id    uuid,
  node_name  text,
  shift_date date,
  shift_type text,
  start_time time,
  person_id  uuid,
  full_name  text,
  role_name  text,
  keyholder  boolean,
  zone       text,
  status     text
)
language sql security definer set search_path = public as $$
  select
    s.id,
    s.node_id,
    n.name,
    s.shift_date,
    coalesce(nullif(s.shift_type, ''),
             case when s.start_time >= '13:00'::time then 'PM' else 'AM' end),
    s.start_time,
    s.person_id,
    p.full_name,
    r.role_name,
    coalesce(r.role_name, '') ~* '(key|manager|lead|owner|supervisor|director|coordinator)',
    s.zone,
    s.status
  from shifts s
  join org_nodes n on n.id = s.node_id
  join people    p on p.id = s.person_id
  left join lateral (
    select rr.name as role_name
    from assignments a
    join roles rr on rr.id = a.role_id
    where a.person_id = s.person_id
    order by (a.node_id = s.node_id) desc, a.effective_from desc nulls last
    limit 1
  ) r on true
  where (p_node_ids is null or s.node_id = any (p_node_ids))
    and s.shift_date >= p_week_start
    and s.shift_date <  p_week_start + 7
    and s.person_id is not null
    and lower(coalesce(s.status, '')) not in ('cancelled', 'open')
  order by s.shift_date, s.start_time nulls last, p.full_name;
$$;
revoke all on function public.vsb_get_schedule(uuid[], date, uuid) from public;
grant execute on function public.vsb_get_schedule(uuid[], date, uuid) to anon, authenticated;

-- ── 2) Write: assign a person to an AM/PM shift on a date (idempotent) ────────
-- One scheduled row per (person, node, date, shift_type). Re-assigning updates
-- the zone/times instead of duplicating. Returns the shift id.
create or replace function public.vsb_assign(
  p_node_id    uuid,
  p_person_id  uuid,
  p_shift_date date,
  p_shift_type text,
  p_zone       text default null,
  p_actor      uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_type  text;
  v_start time;
  v_end   time;
  v_zone  text := nullif(btrim(coalesce(p_zone, '')), '');
begin
  if p_node_id is null or p_person_id is null or p_shift_date is null then
    raise exception 'location, person and date are required';
  end if;

  v_type := case when upper(coalesce(p_shift_type, 'AM')) = 'PM' then 'PM' else 'AM' end;
  if v_type = 'PM' then
    v_start := '13:00'::time; v_end := '21:00'::time;
  else
    v_start := '09:00'::time; v_end := '17:00'::time;
  end if;

  select id into v_id
  from shifts
  where person_id = p_person_id
    and node_id   = p_node_id
    and shift_date = p_shift_date
    and coalesce(nullif(shift_type, ''),
                 case when start_time >= '13:00'::time then 'PM' else 'AM' end) = v_type
    and lower(coalesce(status, '')) <> 'cancelled'
  limit 1;

  if v_id is not null then
    update shifts
       set zone = v_zone, status = 'scheduled', start_time = v_start, end_time = v_end
     where id = v_id;
    return v_id;
  end if;

  insert into shifts (person_id, node_id, shift_date, start_time, end_time, shift_type, status, zone)
  values (p_person_id, p_node_id, p_shift_date, v_start, v_end, v_type, 'scheduled', v_zone)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.vsb_assign(uuid, uuid, date, text, text, uuid) from public;
grant execute on function public.vsb_assign(uuid, uuid, date, text, text, uuid) to anon, authenticated;

-- ── 3) Write: remove an assignment (soft-cancel, keeps history + FKs safe) ────
create or replace function public.vsb_remove(
  p_shift_id uuid,
  p_actor    uuid default null
)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_shift_id is null then
    raise exception 'shift is required';
  end if;
  update shifts set status = 'cancelled' where id = p_shift_id;
  return found;
end $$;
revoke all on function public.vsb_remove(uuid, uuid) from public;
grant execute on function public.vsb_remove(uuid, uuid) to anon, authenticated;
