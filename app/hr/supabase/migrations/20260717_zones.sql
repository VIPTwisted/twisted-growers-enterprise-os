-- ============================================================================
-- Zone Coverage — make the Zones screen fully real (2026-07-17)
-- ----------------------------------------------------------------------------
-- REUSES existing backend (no duplication):
--   • Employees          : get_roster(p_node_ids)
--   • Today's assignments : get_zone_assignments(p_node_ids, p_shift_date)
--   • Assign an employee  : set_zone_assignment(...)
--   • Zone catalog table  : location_zones (id, node_id, zone_key, label,
--                           sort_order, active, tenant_id, created_at)
--   • Assignment table    : zone_assignments (id, node_id, zone, person_id,
--                           employee_name, assigned_by, start_time, end_time,
--                           assignment_date, created_at)
--
-- ADDS only what has no existing home:
--   1. location_zones.min_staff  — minimum headcount per zone (drives KPIs)
--   2. get_location_zones()      — read the per-location zone catalog
--   3. upsert_location_zone()    — no-code create/edit of a zone
--   4. delete_location_zone()    — soft-remove a zone (active = false)
--   5. remove_zone_assignment()  — unassign an employee (used by move/remove)
-- All functions are SECURITY DEFINER, search_path pinned, granted to anon +
-- authenticated (this app authenticates via a custom PIN flow, not GoTrue).
-- Idempotent: safe to run repeatedly.
-- ============================================================================

-- 1. minimum headcount per zone (real config that drives coverage KPIs) --------
alter table public.location_zones
  add column if not exists min_staff integer not null default 1;

-- one zone_key per node (needed for upsert on-conflict + data integrity) --------
create unique index if not exists location_zones_node_zone_key_uidx
  on public.location_zones (node_id, zone_key);

-- ============================================================================
-- 2. get_location_zones — the active zone catalog for one or more locations
-- ============================================================================
create or replace function public.get_location_zones(p_node_ids uuid[])
returns table (
  id         uuid,
  node_id    uuid,
  zone_key   text,
  label      text,
  min_staff  integer,
  sort_order integer,
  active      boolean
)
language sql
security definer
set search_path = public
as $$
  select lz.id, lz.node_id, lz.zone_key, lz.label,
         lz.min_staff, lz.sort_order, lz.active
    from public.location_zones lz
   where lz.node_id = any(p_node_ids)
     and lz.active is true
   order by lz.sort_order nulls last, lz.label;
$$;

-- ============================================================================
-- 3. upsert_location_zone — no-code create / edit of a zone
-- ============================================================================
create or replace function public.upsert_location_zone(
  p_node_id    uuid,
  p_zone_key   text,
  p_label      text,
  p_min_staff  integer default 1,
  p_sort_order integer default 0
)
returns public.location_zones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_row    public.location_zones;
begin
  if p_node_id is null or coalesce(btrim(p_zone_key), '') = '' then
    raise exception 'node and zone_key are required';
  end if;

  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;

  insert into public.location_zones
    (node_id, tenant_id, zone_key, label, min_staff, sort_order, active)
  values
    (p_node_id, v_tenant, btrim(p_zone_key),
     coalesce(nullif(btrim(p_label), ''), btrim(p_zone_key)),
     greatest(coalesce(p_min_staff, 1), 0),
     coalesce(p_sort_order, 0), true)
  on conflict (node_id, zone_key) do update
     set label      = excluded.label,
         min_staff  = excluded.min_staff,
         sort_order = excluded.sort_order,
         active      = true
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================================
-- 4. delete_location_zone — soft-remove (keeps history; disappears from board)
-- ============================================================================
create or replace function public.delete_location_zone(
  p_node_id  uuid,
  p_zone_key text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.location_zones
     set active = false
   where node_id = p_node_id
     and zone_key = p_zone_key;
$$;

-- ============================================================================
-- 5. remove_zone_assignment — unassign an employee from a zone for a date
--    (used by the move flow's "leave source zone" step and the remove button)
-- ============================================================================
create or replace function public.remove_zone_assignment(
  p_node_id   uuid,
  p_zone      text,
  p_person_id uuid,
  p_date      date
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.zone_assignments
   where node_id = p_node_id
     and zone = p_zone
     and assignment_date = p_date
     and (
       (p_person_id is not null and person_id = p_person_id)
       or (p_person_id is null and person_id is null)
     );
$$;

-- ---- grants (this app calls RPCs as anon / authenticated) --------------------
grant execute on function public.get_location_zones(uuid[])                       to anon, authenticated;
grant execute on function public.upsert_location_zone(uuid, text, text, integer, integer) to anon, authenticated;
grant execute on function public.delete_location_zone(uuid, text)                 to anon, authenticated;
grant execute on function public.remove_zone_assignment(uuid, text, uuid, date)   to anon, authenticated;
