-- Attendance Points backend (real, RPC-only) for src/screens/AttendancePoints.jsx.
-- Replaces the screen's former localStorage + seeded-mock data with a real table
-- served through SECURITY DEFINER RPCs, matching the app's pin_login/anon model
-- (RLS ON, no anon policy; RPCs bypass RLS). Idempotent — safe to re-run.
--
-- Column shapes reused from live schema (verified against get_roster / sibling RPCs):
--   people(id, full_name, is_active)  assignments(person_id, node_id, role_id, effective_from)
--   org_nodes(id, name, tenant_id, path)  roles(id, name)

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.attendance_incidents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  node_id         uuid not null,
  person_id       uuid not null,
  incident_type   text not null check (incident_type in ('tardy','callout','ncns')),
  points          numeric not null default 0,
  incident_date   date not null default current_date,
  expiry_months   int  not null default 6,
  expiry_date     date,
  reason          text,
  recorded_by     uuid,
  recorded_by_name text,
  created_at      timestamptz not null default now()
);

create index if not exists attendance_incidents_person_idx on public.attendance_incidents(person_id);
create index if not exists attendance_incidents_node_idx   on public.attendance_incidents(node_id);
create index if not exists attendance_incidents_date_idx    on public.attendance_incidents(incident_date);

alter table public.attendance_incidents enable row level security;

-- ── Read: roster (from real assignments) + each person's incidents ───────────
create or replace function public.get_attendance_overview(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with ppl as (
    select distinct on (p.id)
      p.id            as person_id,
      p.full_name     as full_name,
      a.node_id       as node_id,
      n.name          as location,
      coalesce(r.name,'—') as role
    from people p
    join assignments a on a.person_id = p.id and a.node_id = any(p_node_ids)
    join org_nodes  n on n.id = a.node_id
    left join roles r on r.id = a.role_id
    where coalesce(p.is_active, true) = true
    order by p.id, a.effective_from desc nulls last
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'person_id', ppl.person_id,
        'full_name', ppl.full_name,
        'node_id',   ppl.node_id,
        'location',  ppl.location,
        'role',      ppl.role,
        'incidents', coalesce(inc.items, '[]'::jsonb)
      )
      order by ppl.full_name
    ),
    '[]'::jsonb
  )
  from ppl
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'id',          ai.id,
               'date',        to_char(ai.incident_date,'YYYY-MM-DD'),
               'type',        ai.incident_type,
               'pts',         ai.points,
               'expiry',      to_char(ai.expiry_date,'YYYY-MM-DD'),
               'expired',     (ai.expiry_date is not null and ai.expiry_date < current_date),
               'recorded_by', coalesce(ai.recorded_by_name,'System')
             )
             order by ai.incident_date desc, ai.created_at desc
           ) as items
    from attendance_incidents ai
    where ai.person_id = ppl.person_id
  ) inc on true;
$$;

-- ── Write: record one attendance incident ───────────────────────────────────
create or replace function public.add_attendance_incident(
  p_person_id     uuid,
  p_node_id       uuid,
  p_type          text,
  p_points        numeric,
  p_reason        text default null,
  p_recorded_by   uuid default null,
  p_expiry_months int  default 6,
  p_incident_date date default current_date
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_tenant uuid; v_name text; v_id uuid;
begin
  if p_type not in ('tardy','callout','ncns') then
    raise exception 'Invalid incident type %', p_type;
  end if;
  select tenant_id into v_tenant from org_nodes where id = p_node_id limit 1;
  if v_tenant is null then raise exception 'Unknown node %', p_node_id; end if;
  select full_name into v_name from people where id = p_recorded_by;

  insert into public.attendance_incidents(
    tenant_id, node_id, person_id, incident_type, points,
    incident_date, expiry_months, expiry_date, reason, recorded_by, recorded_by_name)
  values (
    v_tenant, p_node_id, p_person_id, p_type, coalesce(p_points,0),
    p_incident_date, greatest(1, coalesce(p_expiry_months,6)),
    (p_incident_date + (greatest(1, coalesce(p_expiry_months,6)) || ' months')::interval)::date,
    p_reason, p_recorded_by, v_name)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- ── Grants (app auth = pin_login → anon role) ───────────────────────────────
grant execute on function public.get_attendance_overview(uuid[]) to anon, authenticated;
grant execute on function public.add_attendance_incident(uuid,uuid,text,numeric,text,uuid,int,date) to anon, authenticated;
