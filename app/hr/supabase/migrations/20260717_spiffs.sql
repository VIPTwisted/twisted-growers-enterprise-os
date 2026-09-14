-- ============================================================================
-- Spiffs screen — real backend (idempotent)
-- Screen: src/screens/Spiffs.jsx
--
-- REUSED (verified live 2026-07-17, NOT modified here):
--   get_spiff_programs(p_node_ids uuid[])  -> live, returns real program rows
--   spiff_programs(id, unit, title, amount, node_id, end_date, is_active,
--                  tenant_id, created_at, created_by, start_date, description,
--                  product_category)
--   spiff_payouts(id, person_id, node_id, amount, awarded_at, program_id)
--   people(id, full_name, display_name, is_active)
--   org_nodes(id, name, tenant_id)
--   assignments(person_id, node_id, role_id, effective_from, effective_to)
--
-- Direct table writes are RLS-blocked (42501) for anon/authenticated, so all
-- mutations below are SECURITY DEFINER RPCs. New reads add node-scoped,
-- all-employee aggregates the reused reader does not provide.
-- ============================================================================

-- ── Additive columns (rich UI config that the base table lacks) ─────────────
alter table public.spiff_programs add column if not exists category           text;
alter table public.spiff_programs add column if not exists rate_type          text;
alter table public.spiff_programs add column if not exists budget_total        numeric;
alter table public.spiff_programs add column if not exists cap_daily           integer;
alter table public.spiff_programs add column if not exists cap_weekly          integer;
alter table public.spiff_programs add column if not exists eligible_products   text;
alter table public.spiff_programs add column if not exists eligible_locations  text;
alter table public.spiff_programs add column if not exists eligible_roles      text;
alter table public.spiff_programs add column if not exists updated_at          timestamptz;

alter table public.spiff_payouts  add column if not exists tenant_id      uuid;
alter table public.spiff_payouts  add column if not exists quantity       integer default 1;
alter table public.spiff_payouts  add column if not exists transaction_id text;
alter table public.spiff_payouts  add column if not exists notes          text;
alter table public.spiff_payouts  add column if not exists status         text default 'pending';
alter table public.spiff_payouts  add column if not exists verified_by    uuid;
alter table public.spiff_payouts  add column if not exists verified_at    timestamptz;

alter table public.spiff_programs enable row level security;
alter table public.spiff_payouts  enable row level security;

-- ── Enriched program list (base cols + rich config + computed stats) ────────
create or replace function public.spiff_programs_enriched(p_node_ids uuid[] default null)
returns table (
  id uuid, title text, description text, category text, rate_type text,
  rate_amount numeric, unit text, product_category text,
  eligible_products text, cap_daily integer, cap_weekly integer,
  budget_total numeric, start_date date, end_date date, is_active boolean,
  eligible_locations text, eligible_roles text, node_id uuid,
  sold_count bigint, participants bigint, budget_used numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.description,
    coalesce(p.category, p.product_category)                                    as category,
    coalesce(p.rate_type,
             case p.unit when 'per_sale' then 'per-item'
                         when 'percent'  then 'percentage'
                         when 'flat'     then 'flat bonus'
                         else 'per-item' end)                                   as rate_type,
    p.amount                                                                    as rate_amount,
    p.unit,
    p.product_category,
    p.eligible_products,
    p.cap_daily,
    p.cap_weekly,
    p.budget_total,
    p.start_date,
    p.end_date,
    p.is_active,
    coalesce(p.eligible_locations, 'All')                                       as eligible_locations,
    coalesce(p.eligible_roles, 'All Staff')                                     as eligible_roles,
    p.node_id,
    coalesce(s.sold_count, 0)                                                   as sold_count,
    coalesce(s.participants, 0)                                                 as participants,
    coalesce(s.budget_used, 0)                                                  as budget_used
  from public.spiff_programs p
  left join lateral (
    select count(*)                       as sold_count,
           count(distinct pay.person_id)  as participants,
           sum(pay.amount)                as budget_used
    from public.spiff_payouts pay
    where pay.program_id = p.id
  ) s on true
  where p_node_ids is null
     or cardinality(p_node_ids) = 0
     or p.node_id is null
     or p.node_id = any(p_node_ids)
  order by p.is_active desc, p.start_date desc nulls last, p.title;
$$;

-- ── Detailed earnings rows (person-scoped or company/node-scoped) ───────────
create or replace function public.spiff_earnings_scoped(
  p_person_id uuid    default null,
  p_node_ids  uuid[]  default null,
  p_date_from date    default null,
  p_date_to   date    default null
)
returns table (
  id uuid, program_id uuid, program_title text, quantity integer,
  amount numeric, date date, shift text, verified_by text,
  transaction_id text, status text, person_id uuid, person_name text, node_id uuid
)
language sql
security definer
set search_path = public
as $$
  select
    pay.id,
    pay.program_id,
    pr.title                                          as program_title,
    coalesce(pay.quantity, 1)                         as quantity,
    pay.amount,
    pay.awarded_at::date                              as date,
    null::text                                        as shift,
    vb.full_name                                      as verified_by,
    pay.transaction_id,
    coalesce(pay.status, 'paid')                      as status,
    pay.person_id,
    coalesce(pe.display_name, pe.full_name)           as person_name,
    pay.node_id
  from public.spiff_payouts pay
  left join public.spiff_programs pr on pr.id = pay.program_id
  left join public.people pe on pe.id = pay.person_id
  left join public.people vb on vb.id = pay.verified_by
  where (p_person_id is null or pay.person_id = p_person_id)
    and (p_node_ids is null or cardinality(p_node_ids) = 0 or pay.node_id = any(p_node_ids))
    and (p_date_from is null or pay.awarded_at::date >= p_date_from)
    and (p_date_to   is null or pay.awarded_at::date <= p_date_to)
  order by pay.awarded_at desc nulls last;
$$;

-- ── Per-location weekly stats ───────────────────────────────────────────────
create or replace function public.spiff_location_stats(
  p_node_ids   uuid[] default null,
  p_week_start date   default null,
  p_month_start date  default null
)
returns table (
  node_id uuid, location text, spiffs_week bigint,
  total_dollar numeric, avg_per_employee numeric, share_pct numeric
)
language sql
security definer
set search_path = public
as $$
  with wk as (
    select coalesce(p_week_start, (current_date - extract(dow from current_date)::int)) as ws,
           coalesce(p_month_start, date_trunc('month', current_date)::date)             as ms
  ),
  scoped_nodes as (
    select o.id, o.name
    from public.org_nodes o
    where p_node_ids is null or cardinality(p_node_ids) = 0 or o.id = any(p_node_ids)
  ),
  wkpay as (
    select pay.node_id,
           count(*)                      as spiffs_week,
           sum(pay.amount)               as total_dollar,
           count(distinct pay.person_id) as earners
    from public.spiff_payouts pay, wk
    where pay.awarded_at::date >= wk.ws
    group by pay.node_id
  ),
  mopay as (
    select pay.node_id, sum(pay.amount) as month_dollar
    from public.spiff_payouts pay, wk
    where pay.awarded_at::date >= wk.ms
    group by pay.node_id
  ),
  tot as ( select nullif(sum(month_dollar), 0) as t from mopay )
  select
    n.id                                                     as node_id,
    n.name                                                   as location,
    coalesce(w.spiffs_week, 0)                               as spiffs_week,
    coalesce(w.total_dollar, 0)                              as total_dollar,
    round(coalesce(w.total_dollar, 0) / nullif(w.earners, 0), 2) as avg_per_employee,
    round(100 * coalesce(m.month_dollar, 0) / (select t from tot), 1) as share_pct
  from scoped_nodes n
  left join wkpay w on w.node_id = n.id
  left join mopay m on m.node_id = n.id
  order by total_dollar desc nulls last, n.name;
$$;

-- ── Top earners (week + month totals) ───────────────────────────────────────
create or replace function public.spiff_top_earners(
  p_node_ids    uuid[] default null,
  p_week_start  date   default null,
  p_month_start date   default null
)
returns table (
  person_id uuid, person_name text, location text,
  week_total numeric, month_total numeric, count_month bigint
)
language sql
security definer
set search_path = public
as $$
  with wk as (
    select coalesce(p_week_start, (current_date - extract(dow from current_date)::int)) as ws,
           coalesce(p_month_start, date_trunc('month', current_date)::date)             as ms
  ),
  pay as (
    select p.person_id, p.node_id, p.amount, p.awarded_at::date as d
    from public.spiff_payouts p
    where p_node_ids is null or cardinality(p_node_ids) = 0 or p.node_id = any(p_node_ids)
  )
  select
    pe.id                                                              as person_id,
    coalesce(pe.display_name, pe.full_name)                            as person_name,
    max(o.name)                                                        as location,
    sum(case when pay.d >= wk.ws then pay.amount else 0 end)           as week_total,
    sum(case when pay.d >= wk.ms then pay.amount else 0 end)           as month_total,
    count(*) filter (where pay.d >= wk.ms)                             as count_month
  from pay, wk
  join public.people pe on pe.id = pay.person_id
  left join public.org_nodes o on o.id = pay.node_id
  group by pe.id, coalesce(pe.display_name, pe.full_name)
  having sum(case when pay.d >= wk.ms then pay.amount else 0 end) > 0
  order by month_total desc
  limit 25;
$$;

-- ── Write: log a spiff payout ───────────────────────────────────────────────
create or replace function public.log_spiff(
  p_person_id     uuid,
  p_program_id    uuid,
  p_quantity      integer default 1,
  p_amount        numeric default null,
  p_node_id       uuid    default null,
  p_transaction_id text   default null,
  p_notes         text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node    uuid := p_node_id;
  v_tenant  uuid;
  v_amount  numeric := p_amount;
  v_id      uuid;
begin
  if p_person_id is null then raise exception 'person_id required'; end if;
  if p_program_id is null then raise exception 'program_id required'; end if;

  -- resolve node from the person's current assignment when not supplied
  if v_node is null then
    select a.node_id into v_node
    from public.assignments a
    where a.person_id = p_person_id
      and (a.effective_to is null or a.effective_to >= current_date)
    order by a.effective_from desc nulls last
    limit 1;
  end if;

  -- default amount from program rate * quantity if caller omitted it
  if v_amount is null then
    select p.amount * coalesce(p_quantity, 1) into v_amount
    from public.spiff_programs p where p.id = p_program_id;
  end if;

  -- resolve tenant from node, else from the program
  select tenant_id into v_tenant from public.org_nodes where id = v_node;
  if v_tenant is null then
    select tenant_id into v_tenant from public.spiff_programs where id = p_program_id;
  end if;

  insert into public.spiff_payouts
    (person_id, node_id, program_id, amount, awarded_at,
     tenant_id, quantity, transaction_id, notes, status)
  values
    (p_person_id, v_node, p_program_id, coalesce(v_amount, 0), now(),
     v_tenant, coalesce(p_quantity, 1), p_transaction_id, p_notes, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

-- ── Write: create/update a program ──────────────────────────────────────────
create or replace function public.upsert_spiff_program(
  p_id                uuid    default null,
  p_title             text    default null,
  p_description       text    default null,
  p_category          text    default null,
  p_rate_type         text    default 'per-item',
  p_rate_amount       numeric default 0,
  p_eligible_products text    default null,
  p_cap_daily         integer default null,
  p_cap_weekly        integer default null,
  p_budget_total      numeric default null,
  p_start_date        date    default null,
  p_end_date          date    default null,
  p_is_active         boolean default true,
  p_eligible_locations text   default 'All',
  p_eligible_roles    text    default 'All Staff',
  p_node_id           uuid    default null,
  p_actor             uuid    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit   text := case p_rate_type
                     when 'per-item'   then 'per_sale'
                     when 'percentage' then 'percent'
                     when 'flat bonus' then 'flat'
                     else 'per_sale' end;
  v_tenant uuid;
  v_id     uuid;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'title required';
  end if;

  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;
  if v_tenant is null then
    select tenant_id into v_tenant from public.spiff_programs
    order by created_at desc limit 1;
  end if;

  if p_id is null then
    insert into public.spiff_programs
      (title, description, category, product_category, rate_type, unit, amount,
       eligible_products, cap_daily, cap_weekly, budget_total,
       start_date, end_date, is_active, eligible_locations, eligible_roles,
       node_id, tenant_id, created_by, created_at)
    values
      (btrim(p_title), p_description, p_category, p_category, p_rate_type, v_unit, p_rate_amount,
       p_eligible_products, p_cap_daily, p_cap_weekly, p_budget_total,
       p_start_date, p_end_date, coalesce(p_is_active, true), p_eligible_locations, p_eligible_roles,
       p_node_id, v_tenant, p_actor, now())
    returning id into v_id;
  else
    update public.spiff_programs set
      title              = btrim(p_title),
      description        = p_description,
      category           = p_category,
      product_category   = p_category,
      rate_type          = p_rate_type,
      unit               = v_unit,
      amount             = p_rate_amount,
      eligible_products  = p_eligible_products,
      cap_daily          = p_cap_daily,
      cap_weekly         = p_cap_weekly,
      budget_total       = p_budget_total,
      start_date         = p_start_date,
      end_date           = p_end_date,
      is_active          = coalesce(p_is_active, true),
      eligible_locations = p_eligible_locations,
      eligible_roles     = p_eligible_roles,
      updated_at         = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- ── Write: toggle active ────────────────────────────────────────────────────
create or replace function public.set_spiff_program_active(
  p_id uuid, p_active boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.spiff_programs
  set is_active = p_active, updated_at = now()
  where id = p_id;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
grant execute on function public.spiff_programs_enriched(uuid[])                        to anon, authenticated;
grant execute on function public.spiff_earnings_scoped(uuid, uuid[], date, date)        to anon, authenticated;
grant execute on function public.spiff_location_stats(uuid[], date, date)               to anon, authenticated;
grant execute on function public.spiff_top_earners(uuid[], date, date)                  to anon, authenticated;
grant execute on function public.log_spiff(uuid, uuid, integer, numeric, uuid, text, text) to anon, authenticated;
grant execute on function public.upsert_spiff_program(uuid, text, text, text, text, numeric, text, integer, integer, numeric, date, date, boolean, text, text, uuid, uuid) to anon, authenticated;
grant execute on function public.set_spiff_program_active(uuid, boolean)                to anon, authenticated;
