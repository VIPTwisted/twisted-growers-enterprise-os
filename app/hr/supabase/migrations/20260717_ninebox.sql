-- 9-Box Talent Grid backend (real, RPC-only) for src/screens/NineBox.jsx.
-- Replaces the screen's seeded suggestCell()/seed() invented ratings, the
-- MOCK_ROSTER fallback, and the app_state/localStorage placement store with a
-- real talent-review table served through SECURITY DEFINER RPCs. Idempotent.
--
-- Column shapes reused from live schema (verified against get_roster / sibling
-- RPCs — see attendance_points, adminpanel migrations):
--   people(id, full_name, is_active)  assignments(person_id, node_id, role_id, effective_from)
--   org_nodes(id, name, tenant_id)    roles(id, name)
--
-- A placement is one manager-set rating per person: performance & potential each
-- on the classic 1..3 low/med/high scale. Unrated people are returned with NULL
-- ratings so the UI shows an honest "unrated" pool instead of a faked position.

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.nine_box_placements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  person_id      uuid not null unique,
  node_id        uuid,
  performance    int  not null check (performance between 1 and 3),
  potential      int  not null check (potential between 1 and 3),
  note           text,
  rated_by       uuid,
  rated_by_name  text,
  updated_at     timestamptz not null default now()
);

create index if not exists nine_box_placements_person_idx on public.nine_box_placements(person_id);
create index if not exists nine_box_placements_node_idx   on public.nine_box_placements(node_id);

alter table public.nine_box_placements enable row level security;

-- ── Read: scoped roster (from real assignments) + each person's placement ─────
create or replace function public.get_nine_box(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with ppl as (
    select distinct on (p.id)
      p.id                 as person_id,
      p.full_name          as full_name,
      a.node_id            as node_id,
      n.name               as location,
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
        'person_id',   ppl.person_id,
        'full_name',   ppl.full_name,
        'node_id',     ppl.node_id,
        'location',    ppl.location,
        'role',        ppl.role,
        'performance', pl.performance,
        'potential',   pl.potential,
        'note',        pl.note,
        'rated_by',    pl.rated_by_name,
        'rated_at',    to_char(pl.updated_at, 'YYYY-MM-DD')
      )
      order by ppl.full_name
    ),
    '[]'::jsonb
  )
  from ppl
  left join nine_box_placements pl on pl.person_id = ppl.person_id;
$$;

-- ── Write: upsert one person's placement (manager reposition) ────────────────
create or replace function public.set_nine_box_placement(
  p_person_id   uuid,
  p_performance int,
  p_potential   int,
  p_note        text default null,
  p_rated_by    uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_tenant uuid; v_node uuid; v_name text;
begin
  if p_performance is null or p_performance not between 1 and 3
     or p_potential is null or p_potential not between 1 and 3 then
    raise exception 'performance and potential must each be 1..3';
  end if;

  -- resolve the person's current node + tenant from their latest assignment
  select a.node_id, n.tenant_id
    into v_node, v_tenant
  from assignments a
  join org_nodes n on n.id = a.node_id
  where a.person_id = p_person_id
  order by a.effective_from desc nulls last
  limit 1;

  if v_tenant is null then
    -- fall back to the person's tenant via any org node they touch is unavailable;
    -- require a resolvable node so the row is always scoped honestly
    raise exception 'No assignment on record for person % — cannot scope placement', p_person_id;
  end if;

  select full_name into v_name from people where id = p_rated_by;

  insert into public.nine_box_placements(
    tenant_id, person_id, node_id, performance, potential, note, rated_by, rated_by_name, updated_at)
  values (v_tenant, p_person_id, v_node, p_performance, p_potential, p_note, p_rated_by, v_name, now())
  on conflict (person_id) do update set
    node_id       = excluded.node_id,
    performance   = excluded.performance,
    potential     = excluded.potential,
    note          = excluded.note,
    rated_by      = excluded.rated_by,
    rated_by_name = excluded.rated_by_name,
    updated_at    = now();

  return jsonb_build_object('ok', true);
end; $$;

-- ── Write: clear a placement (reset to unrated) ──────────────────────────────
create or replace function public.reset_nine_box_placement(p_person_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.nine_box_placements where person_id = p_person_id;
  return jsonb_build_object('ok', true);
end; $$;

-- ── Grants (app auth = pin_login → anon role) ───────────────────────────────
grant execute on function public.get_nine_box(uuid[]) to anon, authenticated;
grant execute on function public.set_nine_box_placement(uuid,int,int,text,uuid) to anon, authenticated;
grant execute on function public.reset_nine_box_placement(uuid) to anon, authenticated;
