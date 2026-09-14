-- Time Clock Kiosk backend (real, RPC-only) for src/screens/TimeClockKiosk.jsx.
-- Replaces the screen's former localStorage punch store + MOCK_EMPLOYEES + demo
-- PIN mapping + dead /.netlify/functions/pin-login fetch with real, atomic,
-- server-authenticated punches against the existing time_punches table.
--
-- Matches the app's pin_login / anon model: SECURITY DEFINER, RLS stays ON on
-- base tables (RPCs bypass it), EXECUTE granted to anon + authenticated.
-- Idempotent — safe to re-run. NO new tables (reuses live schema only).
--
-- Live column shapes reused (verified 2026-07-17 via PostgREST + pin_login DDL):
--   people(id, login_id, full_name, pin_hash, is_active)
--   assignments(person_id, node_id, role_id, status, effective_from)
--   org_nodes(id, name, node_type, path, tenant_id)
--   time_punches(id, person_id, node_id, work_date, punched_in_at, punched_out_at, hours_worked)
--
-- crypt()/pin_hash live in the `extensions` schema, so search_path includes it
-- exactly like the existing public.pin_login function.

-- ── 1) Authenticated toggle punch ────────────────────────────────────────────
-- Verifies Employee ID + PIN (bcrypt, same logic as pin_login), then toggles the
-- employee's open time_punch: clock IN if none open, else clock OUT. Returns the
-- resolved action + names + timestamps. Never returns the hash. Atomic.
create or replace function public.kiosk_punch(
  p_login_id text,
  p_pin      text,
  p_node_ids uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_person    record;
  v_node_id   uuid;
  v_node_name text;
  v_open_id   uuid;
  v_open_in   timestamptz;
  v_hours     numeric;
  v_scoped    boolean := (p_node_ids is not null and array_length(p_node_ids, 1) is not null);
begin
  select p.id, p.login_id, p.full_name, p.pin_hash, p.is_active
    into v_person
    from people p
   where upper(p.login_id) = upper(trim(coalesce(p_login_id, '')))
   limit 1;

  if v_person.id is null or v_person.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if v_person.pin_hash is null
     or crypt(coalesce(p_pin, ''), v_person.pin_hash) <> v_person.pin_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- Resolve the punch node: prefer an active assignment inside the kiosk's scope.
  select a.node_id into v_node_id
    from assignments a
   where a.person_id = v_person.id
     and a.status = 'active'
     and (not v_scoped or a.node_id = any(p_node_ids))
   order by a.effective_from nulls last
   limit 1;

  -- If none matched inside scope, fall back to the person's primary active node.
  if v_node_id is null then
    select a.node_id into v_node_id
      from assignments a
     where a.person_id = v_person.id
       and a.status = 'active'
     order by a.effective_from nulls last
     limit 1;
  end if;

  select name into v_node_name from org_nodes where id = v_node_id;

  -- Any currently-open punch for this person?
  select id, punched_in_at
    into v_open_id, v_open_in
    from time_punches
   where person_id = v_person.id
     and punched_out_at is null
   order by punched_in_at desc
   limit 1;

  if v_open_id is null then
    -- Clock IN
    insert into time_punches (person_id, node_id, work_date, punched_in_at)
    values (v_person.id, v_node_id, current_date, now())
    returning punched_in_at into v_open_in;

    return jsonb_build_object(
      'ok', true, 'action', 'in',
      'person_id', v_person.id, 'full_name', v_person.full_name,
      'node_id', v_node_id, 'node_name', v_node_name,
      'punched_in_at', v_open_in
    );
  else
    -- Clock OUT
    update time_punches
       set punched_out_at = now(),
           hours_worked   = round(extract(epoch from (now() - punched_in_at)) / 3600.0, 2)
     where id = v_open_id
    returning hours_worked into v_hours;

    return jsonb_build_object(
      'ok', true, 'action', 'out',
      'person_id', v_person.id, 'full_name', v_person.full_name,
      'node_id', v_node_id, 'node_name', v_node_name,
      'punched_in_at', v_open_in,
      'punched_out_at', now(),
      'hours_worked', v_hours
    );
  end if;
end; $$;

-- ── 2) Currently on shift (open punches) scoped to the kiosk's nodes ─────────
create or replace function public.kiosk_active_punches(p_node_ids uuid[] default '{}')
returns table (
  person_id     uuid,
  full_name     text,
  node_id       uuid,
  node_name     text,
  punched_in_at timestamptz
)
language sql stable security definer set search_path to 'public' as $$
  select tp.person_id, p.full_name, tp.node_id, n.name as node_name, tp.punched_in_at
    from time_punches tp
    join people p     on p.id = tp.person_id
    left join org_nodes n on n.id = tp.node_id
   where tp.punched_out_at is null
     and (p_node_ids is null or array_length(p_node_ids, 1) is null or tp.node_id = any(p_node_ids))
   order by tp.punched_in_at desc;
$$;

-- ── 3) Recent activity feed (clock-in + clock-out events) ────────────────────
create or replace function public.kiosk_recent_activity(
  p_node_ids uuid[] default '{}',
  p_limit    int default 8
)
returns table (
  person_id uuid,
  full_name text,
  node_name text,
  action    text,
  event_at  timestamptz
)
language sql stable security definer set search_path to 'public' as $$
  select e.person_id, e.full_name, e.node_name, e.action, e.event_at
  from (
    select tp.person_id, p.full_name, n.name as node_name,
           'in'::text as action, tp.punched_in_at as event_at
      from time_punches tp
      join people p on p.id = tp.person_id
      left join org_nodes n on n.id = tp.node_id
     where tp.punched_in_at is not null
       and (p_node_ids is null or array_length(p_node_ids, 1) is null or tp.node_id = any(p_node_ids))
    union all
    select tp.person_id, p.full_name, n.name as node_name,
           'out'::text as action, tp.punched_out_at as event_at
      from time_punches tp
      join people p on p.id = tp.person_id
      left join org_nodes n on n.id = tp.node_id
     where tp.punched_out_at is not null
       and (p_node_ids is null or array_length(p_node_ids, 1) is null or tp.node_id = any(p_node_ids))
  ) e
  order by e.event_at desc
  limit greatest(coalesce(p_limit, 8), 1);
$$;

-- ── Grants (app auth = pin_login → anon role) ────────────────────────────────
revoke all on function public.kiosk_punch(text, text, uuid[])       from public;
grant execute on function public.kiosk_punch(text, text, uuid[])       to anon, authenticated;
grant execute on function public.kiosk_active_punches(uuid[])          to anon, authenticated;
grant execute on function public.kiosk_recent_activity(uuid[], int)    to anon, authenticated;
