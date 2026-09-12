-- Customer Cultivation — real backend for src/screens/Cultivation.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, NO anon table policies —
-- every read/write goes through SECURITY DEFINER RPCs granted to anon +
-- authenticated, matching every sibling HR RPC (the app authenticates via
-- pin_login and calls RPCs under the anon role).
--
-- REUSE: the pre-existing public.cultivation_customers table (id uuid, node_id
-- uuid -> org_nodes, name text, tier text, phone text, email text, notes text,
-- created_at) is KEPT and EXTENDED — not duplicated. The pre-existing thin
-- get_cultivation_customers(p_location_ids uuid[]) (used ONLY by this screen)
-- is dropped and rebuilt with the rich shape the screen needs. A person's
-- location is via assignments; customers hang off org_nodes directly (node_id)
-- with an assigned rep (people.id).

-- ── 1. Normalize the legacy text tier column to int (table verified empty) ─────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cultivation_customers'
      and column_name = 'tier' and data_type = 'text'
  ) then
    alter table public.cultivation_customers
      alter column tier drop default;
    alter table public.cultivation_customers
      alter column tier type int
      using coalesce(nullif(regexp_replace(coalesce(tier, ''), '\D', '', 'g'), '')::int, 1);
  end if;
end $$;

alter table public.cultivation_customers alter column tier set default 1;

-- ── 2. Extend the existing table with the fields the screen needs ──────────────
alter table public.cultivation_customers
  add column if not exists assigned_to        uuid,                                -- people.id (owning rep)
  add column if not exists preferences        jsonb not null default '[]'::jsonb,  -- e.g. ["Lingerie","Gifts"]
  add column if not exists visit_freq         text  not null default 'occasional', -- weekly | monthly | occasional
  add column if not exists birthday_month     int,                                 -- 0-11 (Jan=0), matches UI month index
  add column if not exists next_followup_date date,
  add column if not exists created_by         uuid,
  add column if not exists updated_at         timestamptz not null default now(),
  add column if not exists is_active          boolean not null default true;

create index if not exists cultivation_customers_node_idx
  on public.cultivation_customers (node_id);
create index if not exists cultivation_customers_assigned_idx
  on public.cultivation_customers (assigned_to);

-- ── 3. Visit history (new capability — nothing existing fits) ──────────────────
create table if not exists public.cultivation_visits (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.cultivation_customers(id) on delete cascade,
  node_id     uuid,
  logged_by   uuid,                              -- people.id of the rep who logged it
  visited_at  date not null default current_date,
  tier        int,                               -- spend tier observed on this visit (optional)
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists cultivation_visits_customer_idx
  on public.cultivation_visits (customer_id, visited_at desc);

alter table public.cultivation_customers enable row level security;
alter table public.cultivation_visits    enable row level security;

-- ── 4. Drop the old thin/phantom overloads (any signature) ─────────────────────
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname in (
      'get_cultivation_customers', 'add_cultivation_customer',
      'update_cultivation_customer', 'log_cultivation_visit',
      'get_cultivation_visits'
    )
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- ── 5. Read: rich customer list, scoped by node (empty scope => all) ───────────
create or replace function public.get_cultivation_customers(p_node_ids uuid[])
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.row order by t.created_at desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'id',                 c.id,
        'name',               c.name,
        'tier',               coalesce(c.tier, 1),
        'phone',              c.phone,
        'email',              c.email,
        'notes',              c.notes,
        'preferences',        coalesce(c.preferences, '[]'::jsonb),
        'visit_freq',         coalesce(c.visit_freq, 'occasional'),
        'birthday_month',     c.birthday_month,
        'next_followup_date', c.next_followup_date,
        'node_id',            c.node_id,
        'location',           n.name,
        'assigned_to',        c.assigned_to,
        'assigned_name',      coalesce(nullif(btrim(p.display_name), ''), p.full_name),
        'last_visit_at',      v.last_at,
        'last_visit_days',    case when v.last_at is null then null
                                   else (current_date - v.last_at) end,
        'visit_count',        coalesce(v.cnt, 0),
        'created_at',         c.created_at
      ) as row,
      c.created_at
    from public.cultivation_customers c
    left join public.org_nodes n on n.id = c.node_id
    left join public.people    p on p.id = c.assigned_to
    left join lateral (
      select max(cv.visited_at) as last_at, count(*)::int as cnt
      from public.cultivation_visits cv
      where cv.customer_id = c.id
    ) v on true
    where c.is_active
      and (p_node_ids is null or cardinality(p_node_ids) = 0 or c.node_id = any(p_node_ids))
  ) t
$$;

-- ── 6. Write: add a customer ───────────────────────────────────────────────────
create or replace function public.add_cultivation_customer(
  p_name           text,
  p_node_id        uuid,
  p_assigned_to    uuid,
  p_tier           int   default 1,
  p_preferences    jsonb default '[]'::jsonb,
  p_phone          text  default null,
  p_email          text  default null,
  p_birthday_month int   default null,
  p_actor          uuid  default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    return jsonb_build_object('ok', false, 'error', 'Name is required');
  end if;
  if p_node_id is null then
    return jsonb_build_object('ok', false, 'error', 'Location is required');
  end if;
  if p_assigned_to is null then
    return jsonb_build_object('ok', false, 'error', 'Assigned rep is required');
  end if;

  insert into public.cultivation_customers
    (name, node_id, assigned_to, tier, preferences, phone, email,
     birthday_month, visit_freq, created_by)
  values
    (btrim(p_name), p_node_id, p_assigned_to,
     greatest(1, least(3, coalesce(p_tier, 1))),
     coalesce(p_preferences, '[]'::jsonb), nullif(btrim(coalesce(p_phone, '')), ''),
     nullif(btrim(coalesce(p_email, '')), ''), p_birthday_month, 'occasional', p_actor)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ── 7. Write: update a customer (notes, tier, freq, follow-up, prefs, rep) ─────
create or replace function public.update_cultivation_customer(
  p_id                 uuid,
  p_notes              text  default null,
  p_tier               int   default null,
  p_visit_freq         text  default null,
  p_next_followup_date date  default null,
  p_preferences        jsonb default null,
  p_assigned_to        uuid  default null,
  p_birthday_month     int   default null,
  p_actor              uuid  default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.cultivation_customers set
    notes              = coalesce(p_notes, notes),
    tier               = case when p_tier is null then tier
                              else greatest(1, least(3, p_tier)) end,
    visit_freq         = coalesce(p_visit_freq, visit_freq),
    next_followup_date = coalesce(p_next_followup_date, next_followup_date),
    preferences        = coalesce(p_preferences, preferences),
    assigned_to        = coalesce(p_assigned_to, assigned_to),
    birthday_month     = coalesce(p_birthday_month, birthday_month),
    updated_at         = now()
  where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Customer not found');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── 8. Write: log a visit ──────────────────────────────────────────────────────
create or replace function public.log_cultivation_visit(
  p_customer_id uuid,
  p_actor       uuid default null,
  p_tier        int  default null,
  p_note        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_id uuid;
begin
  select node_id into v_node from public.cultivation_customers where id = p_customer_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Customer not found');
  end if;

  insert into public.cultivation_visits (customer_id, node_id, logged_by, tier, note)
  values (p_customer_id, v_node, p_actor,
          case when p_tier is null then null else greatest(1, least(3, p_tier)) end,
          nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  update public.cultivation_customers set updated_at = now() where id = p_customer_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ── 9. Read: visit history for one customer ────────────────────────────────────
create or replace function public.get_cultivation_visits(p_customer_id uuid)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.row order by t.visited_at desc, t.created_at desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'id',             v.id,
        'visited_at',     v.visited_at,
        'days_ago',       (current_date - v.visited_at),
        'tier',           v.tier,
        'note',           v.note,
        'logged_by',      v.logged_by,
        'logged_by_name', coalesce(nullif(btrim(p.display_name), ''), p.full_name),
        'created_at',     v.created_at
      ) as row,
      v.visited_at,
      v.created_at
    from public.cultivation_visits v
    left join public.people p on p.id = v.logged_by
    where v.customer_id = p_customer_id
    limit 200
  ) t
$$;

-- ── Grants (RPC-only surface, same as every sibling HR RPC) ────────────────────
grant execute on function public.get_cultivation_customers(uuid[])                                          to anon, authenticated;
grant execute on function public.add_cultivation_customer(text, uuid, uuid, int, jsonb, text, text, int, uuid) to anon, authenticated;
grant execute on function public.update_cultivation_customer(uuid, text, int, text, date, jsonb, uuid, int, uuid) to anon, authenticated;
grant execute on function public.log_cultivation_visit(uuid, uuid, int, text)                               to anon, authenticated;
grant execute on function public.get_cultivation_visits(uuid)                                               to anon, authenticated;
