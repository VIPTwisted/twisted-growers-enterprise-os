-- ============================================================================
-- Availability screen backend (HR brain: zsmdejhgdyyaakqsjhmk)
-- ----------------------------------------------------------------------------
-- REUSES (verified live 2026-07-17 via REST probes):
--   availability_prefs    (id, person_id NOT NULL, node_id, day_of_week int,
--                          start_time time, end_time time, available bool,
--                          note text, updated_at)          -- per-day store, 0 rows
--   availability_requests (id, person_id, node_id, requested jsonb, status,
--                          reviewed_by uuid, reviewed_at, created_at)
--   people / assignments / org_nodes / roles  (get_roster contract)
--
-- REDEFINES (same call sites keep working — arg names preserved; the three
-- consumers of get_team_availability read only person_id + availability_json,
-- which is preserved; the documented availability_json shape stays
-- { Monday:{AM,PM,EVE}, ... } — see ScheduleCenter.jsx):
--   save_availability, get_team_availability, get_availability_requests,
--   submit_availability_request, resolve_availability_request
--
-- NEW:
--   availability_meta          person-level preferred_shift / max_hours / blackouts
--   save_availability_grid     write the whole 7-day x AM/PM/EVE grid + meta at once
--   get_availability_profile   one person's grid + meta (My Availability tab)
--
-- CONVENTIONS (table was empty, so these are now canonical):
--   day_of_week: ISO 1=Monday .. 7=Sunday
--   shift bands: AM 06:00-14:00 · PM 14:00-22:00 · EVE 16:00-23:00
--   (band identity is the start_time: <14:00 AM, 14:00-15:59 PM, >=16:00 EVE)
--
-- Idempotent. security definer, search_path pinned, granted to anon+authenticated.
-- ============================================================================

-- ── New: person-level availability meta ─────────────────────────────────────
create table if not exists public.availability_meta (
  person_id       uuid primary key,
  node_id         uuid,
  preferred_shift text,
  max_hours       int,
  blackout_weeks  jsonb not null default '[]'::jsonb,
  updated_at      timestamptz not null default now()
);
alter table public.availability_meta enable row level security;

-- Upsert key for the per-day store (one row per person x day x shift band).
create unique index if not exists availability_prefs_person_day_start_uniq
  on public.availability_prefs (person_id, day_of_week, start_time);

-- Remove probe junk (rows with no person are meaningless by definition).
delete from public.availability_requests where person_id is null;

-- Drop every overload of the functions being redefined (legacy signatures may
-- differ in types; create-or-replace would otherwise stack ambiguous overloads).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('save_availability','get_team_availability',
                        'get_availability_requests','submit_availability_request',
                        'resolve_availability_request','save_availability_grid',
                        'get_availability_profile')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- ── Helper-free grid builder used by reads (inline CTE pattern) ─────────────

-- READ: whole-team grid, scoped by nodes.
-- Returns one row per person (in scope) who has any availability data.
create or replace function public.get_team_availability(p_node_ids uuid[] default null)
returns table (
  person_id         uuid,
  full_name         text,
  node_id           uuid,
  node_name         text,
  role_name         text,
  availability_json jsonb,
  preferred_shift   text,
  max_hours         int,
  blackout_weeks    jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select distinct p.id, p.full_name
    from people p
    join assignments a on a.person_id = p.id
    where coalesce(p.is_active, true)
      and (p_node_ids is null or array_length(p_node_ids,1) is null or a.node_id = any(p_node_ids))
  ),
  day_grid as (
    select ap.person_id,
           ap.day_of_week,
           jsonb_build_object(
             'AM',  coalesce(bool_or(ap.available and ap.start_time <  '14:00'::time), false),
             'PM',  coalesce(bool_or(ap.available and ap.start_time >= '14:00'::time
                                                  and ap.start_time <  '16:00'::time), false),
             'EVE', coalesce(bool_or(ap.available and ap.start_time >= '16:00'::time), false)
           ) as dj
    from availability_prefs ap
    where ap.day_of_week between 1 and 7
    group by ap.person_id, ap.day_of_week
  ),
  grids as (
    select dg.person_id,
           jsonb_object_agg(
             (array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[dg.day_of_week],
             dg.dj
           ) as availability_json
    from day_grid dg
    group by dg.person_id
  )
  select
    s.id                                   as person_id,
    s.full_name,
    la.node_id,
    onx.name                               as node_name,
    la.role_name,
    coalesce(g.availability_json, '{}'::jsonb) as availability_json,
    m.preferred_shift,
    m.max_hours,
    coalesce(m.blackout_weeks, '[]'::jsonb) as blackout_weeks
  from scoped s
  left join grids g            on g.person_id = s.id
  left join availability_meta m on m.person_id = s.id
  left join lateral (
    select a.node_id, r.name as role_name
    from assignments a
    left join roles r on r.id = a.role_id
    where a.person_id = s.id
    order by a.effective_from desc nulls last
    limit 1
  ) la on true
  left join org_nodes onx on onx.id = la.node_id
  where g.person_id is not null or m.person_id is not null
  order by s.full_name;
$$;

-- READ: one person's grid + meta (My Availability tab).
create or replace function public.get_availability_profile(p_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'person_id', p_person_id,
    'grid', coalesce((
      select jsonb_object_agg(
               (array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[d.day_of_week],
               d.dj)
      from (
        select ap.day_of_week,
               jsonb_build_object(
                 'AM',  coalesce(bool_or(ap.available and ap.start_time <  '14:00'::time), false),
                 'PM',  coalesce(bool_or(ap.available and ap.start_time >= '14:00'::time
                                                      and ap.start_time <  '16:00'::time), false),
                 'EVE', coalesce(bool_or(ap.available and ap.start_time >= '16:00'::time), false)
               ) as dj
        from availability_prefs ap
        where ap.person_id = p_person_id and ap.day_of_week between 1 and 7
        group by ap.day_of_week
      ) d
    ), '{}'::jsonb),
    'preferred_shift', (select m.preferred_shift from availability_meta m where m.person_id = p_person_id),
    'max_hours',       (select m.max_hours       from availability_meta m where m.person_id = p_person_id),
    'blackouts', coalesce((select m.blackout_weeks from availability_meta m where m.person_id = p_person_id), '[]'::jsonb)
  );
$$;

-- WRITE: single day/band row (kept for the existing saveAvailability wrapper
-- and the AvailabilityImport push path). Upserts instead of duplicating.
create or replace function public.save_availability(
  p_person_id   uuid,
  p_node_id     uuid,
  p_day_of_week int,
  p_start_time  time,
  p_end_time    time,
  p_available   boolean,
  p_note        text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_person_id is null then raise exception 'person_id is required'; end if;
  if p_day_of_week is null or p_day_of_week < 1 or p_day_of_week > 7 then
    raise exception 'day_of_week must be 1 (Monday) .. 7 (Sunday)';
  end if;
  insert into availability_prefs (person_id, node_id, day_of_week, start_time, end_time, available, note, updated_at)
  values (p_person_id, p_node_id, p_day_of_week, p_start_time, p_end_time, coalesce(p_available,false), coalesce(p_note,''), now())
  on conflict (person_id, day_of_week, start_time) do update set
    node_id = excluded.node_id,
    end_time = excluded.end_time,
    available = excluded.available,
    note = excluded.note,
    updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- WRITE: whole weekly grid + meta in one call (Availability screen save path).
-- p_grid = { "Monday": {"AM":bool,"PM":bool,"EVE":bool}, ... }
create or replace function public.save_availability_grid(
  p_person_id       uuid,
  p_node_id         uuid    default null,
  p_grid            jsonb   default '{}'::jsonb,
  p_preferred_shift text    default null,
  p_max_hours       int     default null,
  p_blackouts       jsonb   default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days  text[] := array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  v_node  uuid;
  v_day   text;
  v_i     int;
begin
  if p_person_id is null then raise exception 'person_id is required'; end if;

  v_node := p_node_id;
  if v_node is null then
    select a.node_id into v_node
    from assignments a where a.person_id = p_person_id
    order by a.effective_from desc nulls last limit 1;
  end if;

  -- full replace of the person's weekly grid
  delete from availability_prefs where person_id = p_person_id;

  for v_i in 1..7 loop
    v_day := v_days[v_i];
    if p_grid ? v_day then
      insert into availability_prefs (person_id, node_id, day_of_week, start_time, end_time, available, note, updated_at)
      values
        (p_person_id, v_node, v_i, '06:00'::time, '14:00'::time,
         coalesce((p_grid -> v_day ->> 'AM')::boolean,  false), '', now()),
        (p_person_id, v_node, v_i, '14:00'::time, '22:00'::time,
         coalesce((p_grid -> v_day ->> 'PM')::boolean,  false), '', now()),
        (p_person_id, v_node, v_i, '16:00'::time, '23:00'::time,
         coalesce((p_grid -> v_day ->> 'EVE')::boolean, false), '', now());
    end if;
  end loop;

  insert into availability_meta (person_id, node_id, preferred_shift, max_hours, blackout_weeks, updated_at)
  values (p_person_id, v_node, p_preferred_shift, p_max_hours, coalesce(p_blackouts,'[]'::jsonb), now())
  on conflict (person_id) do update set
    node_id         = excluded.node_id,
    preferred_shift = excluded.preferred_shift,
    max_hours       = excluded.max_hours,
    blackout_weeks  = excluded.blackout_weeks,
    updated_at      = now();

  return jsonb_build_object('ok', true, 'person_id', p_person_id);
end;
$$;

-- READ: change requests in scope, with person + location context.
create or replace function public.get_availability_requests(p_node_ids uuid[] default null)
returns table (
  id          uuid,
  person_id   uuid,
  person_name text,
  node_id     uuid,
  location    text,
  requested   jsonb,
  status      text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ar.id,
    ar.person_id,
    p.full_name as person_name,
    ar.node_id,
    onx.name    as location,
    ar.requested,
    ar.status,
    ar.reviewed_by,
    ar.reviewed_at,
    ar.created_at
  from availability_requests ar
  left join people p    on p.id = ar.person_id
  left join org_nodes onx on onx.id = ar.node_id
  where ar.person_id is not null
    and (p_node_ids is null or array_length(p_node_ids,1) is null
         or ar.node_id = any(p_node_ids) or ar.node_id is null)
  order by (ar.status = 'pending') desc, ar.created_at desc;
$$;

-- WRITE: employee submits a change request (payload carries the whole ask:
-- { shifts:{...grid...}, prefs:{preferred_shift,max_hours}, blackouts:[...],
--   reason:text, effective:date }). Node is stamped from latest assignment.
create or replace function public.submit_availability_request(
  p_person_id uuid,
  p_requested jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node uuid;
  v_id   uuid;
begin
  if p_person_id is null then raise exception 'person_id is required'; end if;
  if not exists (select 1 from people where id = p_person_id) then
    raise exception 'person % not found', p_person_id;
  end if;

  select a.node_id into v_node
  from assignments a where a.person_id = p_person_id
  order by a.effective_from desc nulls last limit 1;

  insert into availability_requests (person_id, node_id, requested, status, created_at)
  values (p_person_id, v_node, coalesce(p_requested,'{}'::jsonb), 'pending', now())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'ok', true);
end;
$$;

-- WRITE: HR resolves a request. On approve the requested grid/prefs/blackouts
-- are applied server-side (atomic — no client double-write needed).
create or replace function public.resolve_availability_request(
  p_request_id uuid,
  p_action     text,
  p_reviewer   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req availability_requests%rowtype;
begin
  if p_request_id is null then return jsonb_build_object('ok', false, 'error', 'request_id required'); end if;
  if p_action not in ('approve','deny') then
    return jsonb_build_object('ok', false, 'error', 'action must be approve or deny');
  end if;

  select * into v_req from availability_requests where id = p_request_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'request not found'); end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'request already ' || v_req.status);
  end if;

  update availability_requests
     set status      = case when p_action = 'approve' then 'approved' else 'denied' end,
         reviewed_by = p_reviewer,
         reviewed_at = now()
   where id = p_request_id;

  if p_action = 'approve' and v_req.person_id is not null then
    perform save_availability_grid(
      v_req.person_id,
      v_req.node_id,
      coalesce(v_req.requested -> 'shifts', '{}'::jsonb),
      v_req.requested -> 'prefs' ->> 'preferred_shift',
      nullif(v_req.requested -> 'prefs' ->> 'max_hours','')::int,
      coalesce(v_req.requested -> 'blackouts', '[]'::jsonb)
    );
  end if;

  return jsonb_build_object('ok', true, 'status',
    case when p_action = 'approve' then 'approved' else 'denied' end);
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function public.get_team_availability(uuid[])                                to anon, authenticated;
grant execute on function public.get_availability_profile(uuid)                               to anon, authenticated;
grant execute on function public.save_availability(uuid, uuid, int, time, time, boolean, text) to anon, authenticated;
grant execute on function public.save_availability_grid(uuid, uuid, jsonb, text, int, jsonb)  to anon, authenticated;
grant execute on function public.get_availability_requests(uuid[])                            to anon, authenticated;
grant execute on function public.submit_availability_request(uuid, jsonb)                     to anon, authenticated;
grant execute on function public.resolve_availability_request(uuid, text, uuid)               to anon, authenticated;
