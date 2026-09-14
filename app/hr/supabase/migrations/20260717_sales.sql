-- ═══════════════════════════════════════════════════════════════════════════
-- Sales Intelligence backend  (src/screens/Sales.jsx)
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- Purges the screen's hardcoded mock data path. Everything the forensic sales
-- screen renders now comes from REAL tables (all verified live 2026-07-17 via
-- PostgREST):
--   sales_logs(id, tenant_id, node_id, person_id, amount, units, category,
--              sale_date [date], created_at)          -- enriched below
--   sales_goals(id, tenant_id, node_id, person_id, period, metric, target_value,
--               start_date, end_date, ...)
--   spiff_payouts(id, person_id, node_id, amount, awarded_at, program_id)
--   people(id, full_name, display_name, is_active)
--   assignments(person_id, node_id, role_id, effective_from)
--   org_nodes(id, name, tenant_id)   roles(id, name)
--
-- Reuses existing tables. Adds ONE new table (sales_voids — the void/refund
-- forensics ledger, which had no home) + four nullable columns on sales_logs
-- (time-of-day + POS metadata the screen shows). Read path = get_sales_ledger.
-- Write path = log_sale (wired to the Log Sale modal) and log_void.
--
-- Idempotent — safe to re-run. RLS ON; SECURITY DEFINER RPCs are the only data
-- path, matching the app's pin_login/anon model.
-- ═══════════════════════════════════════════════════════════════════════════

-- 0 ── Enrich sales_logs (nullable / defaulted → non-breaking) ────────────────
alter table public.sales_logs add column if not exists transaction_type text;
alter table public.sales_logs add column if not exists notes            text;
alter table public.sales_logs add column if not exists is_upsell        boolean not null default false;
alter table public.sales_logs add column if not exists sold_at          timestamptz;

-- 1 ── Void / refund forensics ledger ────────────────────────────────────────
create table if not exists public.sales_voids (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid,
  node_id            uuid,
  person_id          uuid,
  sale_id            uuid,
  amount             numeric(12,2) not null default 0,
  units              int           not null default 1,
  category           text,
  reason             text,
  manager_approved   boolean       not null default false,
  suspicious         boolean       not null default false,
  original_sale_date date,
  void_at            timestamptz   not null default now(),
  created_by         uuid,
  created_at         timestamptz   not null default now()
);
alter table public.sales_voids enable row level security;
create index if not exists sales_voids_node_date_idx on public.sales_voids (node_id, void_at);

-- 2 ── Read: full forensic ledger for a node scope ───────────────────────────
-- Returns the recent transaction/void ledger (p_days window) PLUS wider
-- server-side aggregates (quarter, YTD, last-year) the client can't derive from
-- a bounded window, PLUS real goals + spiff payouts. Empty scope / no rows →
-- honest empty arrays (never fabricated).
create or replace function public.get_sales_ledger(
  p_node_ids uuid[],
  p_days     int default 45
) returns jsonb
language sql stable security definer set search_path = public as $$
with params as (
  select greatest(coalesce(p_days, 45), 1)                                   as days,
         (current_date - greatest(coalesce(p_days, 45), 1))::date            as from_date,
         current_date                                                        as to_date
),
scope as (
  select n.id, n.name, n.tenant_id from org_nodes n where n.id = any(p_node_ids)
),
prole as (  -- primary (most recent) role per person within scope
  select distinct on (a.person_id) a.person_id, r.name as role_name
  from assignments a
  left join roles r on r.id = a.role_id
  where a.node_id = any(p_node_ids)
  order by a.person_id, a.effective_from desc nulls last
),
s as (
  select
    sl.id, sl.person_id, sl.node_id, sl.amount, sl.category, sl.transaction_type,
    sl.notes, sl.is_upsell,
    coalesce(sl.units, 1)                                              as units,
    coalesce(pe.display_name, pe.full_name, 'Unknown')                as rep_name,
    coalesce(pr.role_name, '—')                                       as role_name,
    sc.name                                                           as location_name,
    to_char(coalesce(sl.sold_at, sl.created_at, sl.sale_date::timestamp),
            'YYYY-MM-DD"T"HH24:MI:SS')                                as sale_ts
  from sales_logs sl
  join scope sc     on sc.id = sl.node_id
  left join people pe on pe.id = sl.person_id
  left join prole pr  on pr.person_id = sl.person_id
  where sl.sale_date >= (select from_date from params)
),
v as (
  select
    sv.id, sv.sale_id, sv.person_id, sv.node_id, sv.amount, sv.category,
    sv.reason, sv.manager_approved, sv.suspicious, sv.original_sale_date,
    coalesce(pe.display_name, pe.full_name, 'Unknown')                as rep_name,
    sc.name                                                           as location_name,
    to_char(coalesce(sv.void_at, sv.created_at),
            'YYYY-MM-DD"T"HH24:MI:SS')                                as void_ts
  from sales_voids sv
  join scope sc     on sc.id = sv.node_id
  left join people pe on pe.id = sv.person_id
  where coalesce(sv.void_at, sv.created_at)::date >= (select from_date from params)
),
wide as (  -- quarter + YTD per node (beyond the p_days window)
  select sl.node_id,
    sum(sl.amount) filter (where sl.sale_date >= date_trunc('quarter', current_date)::date) as quarter,
    sum(sl.amount) filter (where sl.sale_date >= date_trunc('year',    current_date)::date) as ytd
  from sales_logs sl
  where sl.node_id = any(p_node_ids)
    and sl.sale_date >= date_trunc('year', current_date)::date
  group by sl.node_id
),
ly as (  -- last-year month-to-date-equivalent revenue across scope
  select coalesce(sum(sl.amount), 0) as amt
  from sales_logs sl
  where sl.node_id = any(p_node_ids)
    and sl.sale_date >= (date_trunc('month', current_date) - interval '1 year')::date
    and sl.sale_date <= (current_date - interval '1 year')::date
),
sp as (
  select spp.person_id, spp.node_id, spp.amount,
         to_char(spp.awarded_at, 'YYYY-MM-DD') as awarded
  from spiff_payouts spp
  where spp.node_id = any(p_node_ids)
    and spp.awarded_at is not null
    and spp.awarded_at::date >= (select from_date from params)
),
g as (
  select node_id, lower(coalesce(period, '')) as period, target_value
  from sales_goals
  where node_id = any(p_node_ids)
    and (start_date is null or start_date <= current_date)
    and (end_date   is null or end_date   >= current_date)
)
select jsonb_build_object(
  'ok',          true,
  'window_days', (select days from params),
  'from_date',   (select from_date from params),
  'to_date',     (select to_date   from params),
  'locations', coalesce(
    (select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from scope),
    '[]'::jsonb),
  'sales', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'id', s.id, 'person_id', s.person_id, 'rep_name', s.rep_name, 'role', s.role_name,
        'node_id', s.node_id, 'location_name', s.location_name,
        'amount', s.amount, 'items', s.units, 'category', coalesce(s.category, 'Other'),
        'transaction_type', s.transaction_type, 'upsell', coalesce(s.is_upsell, false),
        'sale_date', s.sale_ts, 'notes', s.notes)) from s),
    '[]'::jsonb),
  'voids', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'id', v.id, 'sale_id', v.sale_id, 'person_id', v.person_id, 'rep_name', v.rep_name,
        'node_id', v.node_id, 'location_name', v.location_name, 'amount', v.amount,
        'category', coalesce(v.category, 'Other'), 'reason', v.reason,
        'manager_approved', v.manager_approved, 'suspicious', v.suspicious,
        'original_sale_date', to_char(v.original_sale_date, 'YYYY-MM-DD'),
        'void_date', v.void_ts)) from v),
    '[]'::jsonb),
  'wide', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'node_id', node_id, 'quarter', coalesce(quarter, 0), 'ytd', coalesce(ytd, 0))) from wide),
    '[]'::jsonb),
  'ly_revenue', (select amt from ly),
  'spiffs', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'person_id', person_id, 'node_id', node_id, 'amount', amount, 'awarded', awarded)) from sp),
    '[]'::jsonb),
  'goals', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'node_id', node_id, 'period', period, 'target', target_value)) from g),
    '[]'::jsonb)
);
$$;

revoke all on function public.get_sales_ledger(uuid[], int) from public;
grant execute on function public.get_sales_ledger(uuid[], int) to anon, authenticated;

-- 3 ── Write: log a sale (wired to the Log Sale modal) ───────────────────────
create or replace function public.log_sale(
  p_person_id        uuid,
  p_node_id          uuid,
  p_amount           numeric,
  p_units            int     default 1,
  p_category         text    default null,
  p_transaction_type text    default null,
  p_notes            text    default null,
  p_is_upsell        boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_id     uuid;
begin
  if p_node_id is null then
    return jsonb_build_object('ok', false, 'error', 'A location is required.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Amount must be greater than zero.');
  end if;

  select tenant_id into v_tenant from org_nodes where id = p_node_id;

  insert into public.sales_logs
    (tenant_id, node_id, person_id, amount, units, category,
     transaction_type, notes, is_upsell, sale_date, sold_at, created_at)
  values
    (v_tenant, p_node_id, p_person_id, p_amount, greatest(coalesce(p_units, 1), 1),
     p_category, p_transaction_type, p_notes, coalesce(p_is_upsell, false),
     current_date, now(), now())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

revoke all on function public.log_sale(uuid, uuid, numeric, int, text, text, text, boolean) from public;
grant execute on function public.log_sale(uuid, uuid, numeric, int, text, text, text, boolean) to anon, authenticated;

-- 4 ── Write: log a void / refund ────────────────────────────────────────────
create or replace function public.log_void(
  p_person_id        uuid,
  p_node_id          uuid,
  p_amount           numeric,
  p_units            int     default 1,
  p_category         text    default null,
  p_reason           text    default null,
  p_sale_id          uuid    default null,
  p_manager_approved boolean default false,
  p_suspicious       boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_id     uuid;
begin
  if p_node_id is null then
    return jsonb_build_object('ok', false, 'error', 'A location is required.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Amount must be greater than zero.');
  end if;

  select tenant_id into v_tenant from org_nodes where id = p_node_id;

  insert into public.sales_voids
    (tenant_id, node_id, person_id, sale_id, amount, units, category, reason,
     manager_approved, suspicious, original_sale_date, void_at, created_by, created_at)
  values
    (v_tenant, p_node_id, p_person_id, p_sale_id, p_amount, greatest(coalesce(p_units, 1), 1),
     p_category, p_reason, coalesce(p_manager_approved, false), coalesce(p_suspicious, false),
     current_date, now(), p_person_id, now())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

revoke all on function public.log_void(uuid, uuid, numeric, int, text, text, uuid, boolean, boolean) from public;
grant execute on function public.log_void(uuid, uuid, numeric, int, text, text, uuid, boolean, boolean) to anon, authenticated;
