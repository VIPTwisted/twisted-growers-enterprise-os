-- 20260717_schedulecenter.sql
-- Make the Schedule Command Center (src/screens/ScheduleCenter.jsx) fully REAL.
-- Purges four localStorage pseudo-datastores (vip_sched_center, vip_sched_minreq,
-- vip_coverage_requests, vip_oncall) + a hardcoded DEMO_ROSTER by wiring the
-- screen to real backend reads/writes.
--
-- REUSED (already live/verified 2026-07-17 via PostgREST — NOT redefined here):
--   * get_roster(uuid[],uuid)               — employees + role + node (live)
--   * get_team_availability(uuid[])         — availability_json per person (live)
--   * get_week_schedule(uuid[],date)        — shift_id/full_name/node_name/zone/
--                                             keyholder_eligible/status per shift (live)
--   * schedule_assign(p_actor,p_node_id,p_person_id,p_date,p_slot,p_start,p_end,
--                     p_ends_at_close,p_zones,p_break_start,p_break_end,
--                     p_requires_key,p_schedule_id) — assign a person to a shift
--                     (live; proven in ScheduleBuilder.jsx). Writes public.shifts;
--                     get_week_schedule reads the same table, so grids stay in sync.
--
-- NEW here — verified MISSING live via PostgREST probes 2026-07-17
-- (no schedule_unassign/create_coverage_request/*min_req* function exists; the
--  existing shift-based coverage_requests table has no multi-recipient model, and
--  public.on_call has no per-date dimension). Nothing existing fit, so:
--   * schedule_center_unassign        — remove a scheduled shift by id
--   * sched_coverage_targets (+RPCs)  — per-node, per-slot KH/Associate minimums
--   * sched_on_call (+RPCs)           — per-node, per-DATE on-call roster
--   * sched_coverage_ask (+recipients, +RPCs) — multi-recipient coverage requests
--
-- Idempotent. SECURITY DEFINER + search_path=public. RLS enabled on every new
-- table (RPC-only access). Explicit grants to anon, authenticated. No seed/fake data.

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Unassign a scheduled shift (real delete on public.shifts)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.schedule_center_unassign(
  p_shift_id uuid,
  p_actor    uuid default null
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_shift_id is null then
    raise exception 'shift is required';
  end if;

  -- Preserve the forensic trail: never delete a shift whose callout/no-show has
  -- already been escalated to a disciplinary record.
  if exists (
    select 1 from shift_exceptions se
    where se.shift_id = p_shift_id
      and se.disciplinary_record_id is not null
  ) then
    raise exception 'cannot unassign: this shift has a linked disciplinary record';
  end if;

  delete from shift_claims     where shift_id = p_shift_id;
  delete from shift_exceptions where shift_id = p_shift_id;
  delete from shifts           where id       = p_shift_id;

  return found;
end $$;
revoke all on function public.schedule_center_unassign(uuid, uuid) from public;
grant execute on function public.schedule_center_unassign(uuid, uuid) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Per-node, per-slot minimum coverage targets (Key Holders / Associates)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.sched_coverage_targets (
  id             uuid primary key default gen_random_uuid(),
  node_id        uuid not null references public.org_nodes(id) on delete cascade,
  slot           text not null,                       -- 'AM' | 'PM' | 'EVE'
  kh_required    integer not null default 0 check (kh_required >= 0),
  assoc_required integer not null default 0 check (assoc_required >= 0),
  updated_at     timestamptz not null default now(),
  unique (node_id, slot)
);
alter table public.sched_coverage_targets enable row level security;

create or replace function public.get_coverage_targets(p_node_ids uuid[] default null)
returns table (node_id uuid, slot text, kh_required integer, assoc_required integer)
language sql security definer set search_path = public as $$
  select t.node_id, t.slot, t.kh_required, t.assoc_required
  from sched_coverage_targets t
  where p_node_ids is null or t.node_id = any (p_node_ids);
$$;
revoke all on function public.get_coverage_targets(uuid[]) from public;
grant execute on function public.get_coverage_targets(uuid[]) to anon, authenticated;

create or replace function public.set_coverage_target(
  p_node_id uuid,
  p_slot    text,
  p_kh      integer,
  p_assoc   integer
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_node_id is null or p_slot is null then
    raise exception 'location and slot are required';
  end if;
  insert into sched_coverage_targets (node_id, slot, kh_required, assoc_required, updated_at)
  values (p_node_id, upper(p_slot), greatest(0, coalesce(p_kh, 0)), greatest(0, coalesce(p_assoc, 0)), now())
  on conflict (node_id, slot) do update
    set kh_required    = excluded.kh_required,
        assoc_required = excluded.assoc_required,
        updated_at     = now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.set_coverage_target(uuid, text, integer, integer) from public;
grant execute on function public.set_coverage_target(uuid, text, integer, integer) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Per-node, per-DATE on-call roster
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.sched_on_call (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null references public.org_nodes(id) on delete cascade,
  on_date    date not null,
  person_id  uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (node_id, on_date, person_id)
);
create index if not exists idx_sched_on_call_node_date on public.sched_on_call (node_id, on_date);
alter table public.sched_on_call enable row level security;

create or replace function public.get_sched_on_call(
  p_node_ids uuid[] default null,
  p_from     date   default null,
  p_to       date   default null
) returns table (
  node_id   uuid,
  node_name text,
  on_date   date,
  person_id uuid,
  full_name text,
  role_name text
)
language sql security definer set search_path = public as $$
  select
    oc.node_id,
    n.name,
    oc.on_date,
    oc.person_id,
    p.full_name,
    r.name
  from sched_on_call oc
  join people p on p.id = oc.person_id
  left join org_nodes n on n.id = oc.node_id
  left join lateral (
    select a.role_id from assignments a
    where a.person_id = oc.person_id
    order by a.effective_from desc nulls last
    limit 1
  ) la on true
  left join roles r on r.id = la.role_id
  where (p_node_ids is null or oc.node_id = any (p_node_ids))
    and (p_from is null or oc.on_date >= p_from)
    and (p_to   is null or oc.on_date <= p_to)
  order by oc.on_date, n.name nulls last, p.full_name;
$$;
revoke all on function public.get_sched_on_call(uuid[], date, date) from public;
grant execute on function public.get_sched_on_call(uuid[], date, date) to anon, authenticated;

-- Replace the on-call list for one (node, date) with exactly the supplied people.
create or replace function public.set_sched_on_call(
  p_node_id    uuid,
  p_date       date,
  p_person_ids uuid[] default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer := 0;
begin
  if p_node_id is null or p_date is null then
    raise exception 'location and date are required';
  end if;
  delete from sched_on_call where node_id = p_node_id and on_date = p_date;
  if p_person_ids is not null then
    insert into sched_on_call (node_id, on_date, person_id)
    select p_node_id, p_date, pid
    from unnest(p_person_ids) as pid
    where pid is not null
    on conflict (node_id, on_date, person_id) do nothing;
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end $$;
revoke all on function public.set_sched_on_call(uuid, date, uuid[]) from public;
grant execute on function public.set_sched_on_call(uuid, date, uuid[]) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Multi-recipient coverage requests (in-app + text asks with per-person status)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.sched_coverage_ask (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null references public.org_nodes(id) on delete cascade,
  ask_date     date not null,
  slot         text not null,
  requester_id uuid references public.people(id),
  message      text,
  channel      text not null default 'both'   check (channel  in ('both','app','text')),
  urgency      text not null default 'normal' check (urgency  in ('normal','high','critical')),
  blast        boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.sched_coverage_ask enable row level security;

create table if not exists public.sched_coverage_ask_recipient (
  id           uuid primary key default gen_random_uuid(),
  ask_id       uuid not null references public.sched_coverage_ask(id) on delete cascade,
  person_id    uuid not null references public.people(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','approved','declined')),
  reason       text,
  responded_at timestamptz,
  unique (ask_id, person_id)
);
create index if not exists idx_cov_ask_recipient_person on public.sched_coverage_ask_recipient (person_id);
alter table public.sched_coverage_ask_recipient enable row level security;

create or replace function public.create_coverage_ask(
  p_node_id      uuid,
  p_date         date,
  p_slot         text,
  p_requester    uuid,
  p_message      text,
  p_channel      text,
  p_urgency      text,
  p_blast        boolean,
  p_recipient_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_node_id is null or p_date is null or p_slot is null then
    raise exception 'location, date and slot are required';
  end if;
  insert into sched_coverage_ask (node_id, ask_date, slot, requester_id, message, channel, urgency, blast)
  values (
    p_node_id, p_date, upper(p_slot), p_requester, nullif(btrim(coalesce(p_message,'')),''),
    coalesce(lower(p_channel),'both'), coalesce(lower(p_urgency),'normal'), coalesce(p_blast,false)
  )
  returning id into v_id;

  if p_recipient_ids is not null then
    insert into sched_coverage_ask_recipient (ask_id, person_id)
    select v_id, pid
    from unnest(p_recipient_ids) as pid
    where pid is not null
    on conflict (ask_id, person_id) do nothing;
  end if;
  return v_id;
end $$;
revoke all on function public.create_coverage_ask(uuid, date, text, uuid, text, text, text, boolean, uuid[]) from public;
grant execute on function public.create_coverage_ask(uuid, date, text, uuid, text, text, text, boolean, uuid[]) to anon, authenticated;

create or replace function public.respond_coverage_ask(
  p_ask_id    uuid,
  p_person_id uuid,
  p_status    text,
  p_reason    text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_ask_id is null or p_person_id is null then
    raise exception 'ask and person are required';
  end if;
  v_status := lower(coalesce(p_status,'pending'));
  if v_status not in ('pending','approved','declined') then
    v_status := 'pending';
  end if;
  update sched_coverage_ask_recipient
     set status = v_status,
         reason = nullif(btrim(coalesce(p_reason,'')),''),
         responded_at = case when v_status = 'pending' then null else now() end
   where ask_id = p_ask_id and person_id = p_person_id;
  return found;
end $$;
revoke all on function public.respond_coverage_ask(uuid, uuid, text, text) from public;
grant execute on function public.respond_coverage_ask(uuid, uuid, text, text) to anon, authenticated;

-- Read asks (newest first) with node/requester names + nested recipients.
create or replace function public.get_coverage_asks(p_node_ids uuid[] default null)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_j order by created_at desc), '[]'::jsonb)
  from (
    select
      a.created_at,
      jsonb_build_object(
        'id',           a.id,
        'location',     n.name,
        'node_id',      a.node_id,
        'date',         a.ask_date,
        'shift',        a.slot,
        'message',      a.message,
        'channel',      a.channel,
        'urgency',      a.urgency,
        'blast',        a.blast,
        'created_at',   a.created_at,
        'requester_id', a.requester_id,
        'requester',    coalesce(rp.full_name, 'Manager'),
        'recipients',   coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id',          rc.person_id,
                   'name',        pp.full_name,
                   'loc',         rn.name,
                   'status',      rc.status,
                   'reason',      rc.reason,
                   'responded_at', rc.responded_at
                 ) order by pp.full_name)
          from sched_coverage_ask_recipient rc
          join people pp on pp.id = rc.person_id
          left join lateral (
            select asg.node_id from assignments asg
            where asg.person_id = rc.person_id
            order by asg.effective_from desc nulls last
            limit 1
          ) lrn on true
          left join org_nodes rn on rn.id = lrn.node_id
          where rc.ask_id = a.id
        ), '[]'::jsonb)
      ) as row_j
    from sched_coverage_ask a
    left join org_nodes n on n.id = a.node_id
    left join people rp on rp.id = a.requester_id
    where p_node_ids is null or a.node_id = any (p_node_ids)
  ) x;
$$;
revoke all on function public.get_coverage_asks(uuid[]) from public;
grant execute on function public.get_coverage_asks(uuid[]) to anon, authenticated;
