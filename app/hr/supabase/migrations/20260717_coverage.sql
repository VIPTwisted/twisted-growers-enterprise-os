-- 20260717_coverage.sql
-- Wire the Coverage screen (src/screens/Coverage.jsx) to REAL data.
--
-- REUSED (live, or pending in sibling migrations — NOT redefined here):
--   * forensic_callouts(uuid[],date,date)      — gaps + history (live, verified 2026-07-17)
--   * get_coverage_gaps(uuid[],date,date)      — required vs scheduled staffing (live)
--   * get_roster / scope_shifts / get_team_availability — employees, hours, availability (live)
--   * review_shift_claim(uuid,text,uuid)       — approve/deny a volunteer claim (live)
--   * set_callout_coverage(uuid,uuid,text)     — mark a callout covered (20260717_callouttracker.sql)
--   * post_shift_broadcast(...)                — escalation / notify blasts (20260717_communications.sql)
--
-- NEW here — verified MISSING live via PostgREST probes 2026-07-17:
--   * public.on_call exists (id, person_id, node_id, created_at) but had ZERO RPCs
--     reading or writing it, and RLS blocks anon direct access → roster was dead.
--   * No call-attempt history (last-called / accepted / declined stats).
--   * No way to post an open shift to a swap board, volunteer for it, or read the
--     board. Built on the EXISTING shifts + shift_claims tables (no parallel store);
--     volunteers are shift_claims rows, confirmation goes through the existing
--     review_shift_claim RPC.
--
-- Idempotent. SECURITY DEFINER + explicit grants (RLS-locked tables, RPC-only access).

-- ── 1) Call-attempt history for the on-call roster ───────────────────────────
create table if not exists public.on_call_attempts (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people(id) on delete cascade,
  exception_id uuid,                          -- optional link to shift_exceptions (the gap being covered)
  called_by    uuid references public.people(id),
  outcome      text not null default 'called'
               check (outcome in ('called', 'accepted', 'declined', 'no_answer')),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_on_call_attempts_person on public.on_call_attempts (person_id, created_at desc);
alter table public.on_call_attempts enable row level security;

-- ── 2) Read the on-call roster (people + latest role + node + attempt stats) ─
create or replace function public.get_on_call_roster(p_node_ids uuid[] default null)
returns table (
  person_id     uuid,
  full_name     text,
  phone         text,
  email         text,
  role_name     text,
  node_id       uuid,
  node_name     text,
  on_call_since timestamptz,
  last_called   timestamptz,
  accepted      integer,
  declined      integer,
  called        integer
)
language sql security definer set search_path = public as $$
  select
    p.id,
    p.full_name,
    p.phone,
    p.email,
    r.name,
    oc.node_id,
    n.name,
    oc.created_at,
    t.last_called,
    coalesce(t.accepted, 0)::int,
    coalesce(t.declined, 0)::int,
    coalesce(t.called, 0)::int
  from on_call oc
  join people p on p.id = oc.person_id and coalesce(p.is_active, true)
  left join org_nodes n on n.id = oc.node_id
  left join lateral (
    select a.role_id
    from assignments a
    where a.person_id = p.id
    order by a.effective_from desc nulls last
    limit 1
  ) la on true
  left join roles r on r.id = la.role_id
  left join lateral (
    select
      max(oa.created_at)                                        as last_called,
      count(*) filter (where oa.outcome = 'accepted')           as accepted,
      count(*) filter (where oa.outcome in ('declined','no_answer')) as declined,
      count(*)                                                  as called
    from on_call_attempts oa
    where oa.person_id = p.id
  ) t on true
  where p_node_ids is null or oc.node_id = any (p_node_ids)
  order by n.name nulls last, p.full_name;
$$;
revoke all on function public.get_on_call_roster(uuid[]) from public;
grant execute on function public.get_on_call_roster(uuid[]) to anon, authenticated;

-- ── 3) Add / remove someone on the on-call roster ────────────────────────────
create or replace function public.set_on_call(
  p_person_id uuid,
  p_active    boolean,
  p_node_id   uuid default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_node uuid;
begin
  if p_person_id is null then
    raise exception 'person is required';
  end if;

  if coalesce(p_active, false) then
    -- Resolve the node from the person's latest assignment when not supplied.
    v_node := p_node_id;
    if v_node is null then
      select a.node_id into v_node
      from assignments a
      where a.person_id = p_person_id
      order by a.effective_from desc nulls last
      limit 1;
    end if;
    if v_node is null then
      raise exception 'no location assignment found for this person';
    end if;
    if not exists (select 1 from on_call oc where oc.person_id = p_person_id) then
      insert into on_call (person_id, node_id) values (p_person_id, v_node);
    end if;
    return true;
  else
    delete from on_call where person_id = p_person_id;
    return found;
  end if;
end $$;
revoke all on function public.set_on_call(uuid, boolean, uuid) from public;
grant execute on function public.set_on_call(uuid, boolean, uuid) to anon, authenticated;

-- ── 4) Log a call attempt / response (feeds last-called + reliability) ───────
create or replace function public.log_on_call_attempt(
  p_person_id    uuid,
  p_outcome      text default 'called',
  p_called_by    uuid default null,
  p_exception_id uuid default null,
  p_note         text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_outcome text;
  v_id      uuid;
begin
  if p_person_id is null then
    raise exception 'person is required';
  end if;
  v_outcome := lower(coalesce(p_outcome, 'called'));
  if v_outcome not in ('called', 'accepted', 'declined', 'no_answer') then
    v_outcome := 'called';
  end if;
  insert into on_call_attempts (person_id, outcome, called_by, exception_id, note)
  values (p_person_id, v_outcome, p_called_by, p_exception_id, p_note)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.log_on_call_attempt(uuid, text, uuid, uuid, text) from public;
grant execute on function public.log_on_call_attempt(uuid, text, uuid, uuid, text) to anon, authenticated;

-- ── 5) Swap board: post an OPEN (unassigned) shift needing coverage ──────────
-- Open postings are rows in the existing shifts table with status='open' and no
-- person. shifts.person_id must therefore be nullable; drop NOT NULL only if it
-- is currently enforced (guarded, idempotent).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shifts'
      and column_name = 'person_id' and is_nullable = 'NO'
  ) then
    alter table public.shifts alter column person_id drop not null;
  end if;
end $$;

create or replace function public.post_open_shift(
  p_node_id uuid,
  p_date    date,
  p_start   time default null,
  p_end     time default null,
  p_note    text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_node_id is null or p_date is null then
    raise exception 'location and date are required';
  end if;
  insert into shifts (person_id, node_id, shift_date, start_time, end_time, shift_type, status, notes)
  values (null, p_node_id, p_date, p_start, p_end,
          case when p_start is not null and p_start >= '14:00'::time then 'PM' else 'AM' end,
          'open', nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.post_open_shift(uuid, date, time, time, text) from public;
grant execute on function public.post_open_shift(uuid, date, time, time, text) to anon, authenticated;

-- ── 6) Swap board: volunteer for an open shift (a shift_claims row) ──────────
create or replace function public.volunteer_open_shift(
  p_shift_id  uuid,
  p_person_id uuid,
  p_note      text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_node uuid;
  v_id   uuid;
begin
  if p_shift_id is null or p_person_id is null then
    raise exception 'shift and person are required';
  end if;
  -- Already volunteered (pending or approved) → return the existing claim.
  select c.id into v_id
  from shift_claims c
  where c.shift_id = p_shift_id and c.person_id = p_person_id
    and lower(coalesce(c.status, 'pending')) in ('pending', 'approved')
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  select s.node_id into v_node from shifts s where s.id = p_shift_id;
  if v_node is null then
    raise exception 'open shift not found';
  end if;
  insert into shift_claims (shift_id, person_id, node_id, status, note)
  values (p_shift_id, p_person_id, v_node, 'pending', nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.volunteer_open_shift(uuid, uuid, text) from public;
grant execute on function public.volunteer_open_shift(uuid, uuid, text) to anon, authenticated;

-- ── 7) Swap board: read open postings with their volunteers ──────────────────
create or replace function public.get_swap_board(
  p_node_ids  uuid[] default null,
  p_date_from date   default null
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_j order by shift_date, node), '[]'::jsonb)
  from (
    select
      s.shift_date,
      n.name as node,
      jsonb_build_object(
        'id',         s.id,
        'node_id',    s.node_id,
        'node',       n.name,
        'shift_date', s.shift_date,
        'start_time', s.start_time,
        'end_time',   s.end_time,
        'posted_at',  s.created_at,
        'note',       s.notes,
        'status',     case
                        when s.person_id is not null then 'filled'
                        when exists (
                          select 1 from shift_claims c
                          where c.shift_id = s.id and lower(coalesce(c.status,'')) = 'approved'
                        ) then 'filled'
                        else 'open'
                      end,
        'volunteers', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'claim_id',   c.id,
                   'person_id',  c.person_id,
                   'name',       p.full_name,
                   'status',     c.status,
                   'claimed_at', c.created_at,
                   'note',       c.note
                 ) order by c.created_at)
          from shift_claims c
          join people p on p.id = c.person_id
          where c.shift_id = s.id
            and lower(coalesce(c.status, 'pending')) in ('pending', 'approved')
        ), '[]'::jsonb)
      ) as row_j
    from shifts s
    left join org_nodes n on n.id = s.node_id
    where lower(coalesce(s.status, '')) = 'open'
      and (p_node_ids is null or s.node_id = any (p_node_ids))
      and (p_date_from is null or s.shift_date >= p_date_from)
  ) x;
$$;
revoke all on function public.get_swap_board(uuid[], date) from public;
grant execute on function public.get_swap_board(uuid[], date) to anon, authenticated;
