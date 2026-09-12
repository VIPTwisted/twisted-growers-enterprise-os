-- ═══════════════════════════════════════════════════════════════════════════
-- Products backend (src/screens/Products.jsx)
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- The Products screen previously rendered a 50-row hardcoded mock catalog with
-- seed()/Math-derived stock, sales and velocity. There is NO product catalog
-- table in this brain (verified: the live-table inventory documented in
-- 20260717_analytics.sql lists sales_logs but no product/inventory table, and
-- get_products_catalog / bulk_update_prices do not exist -> 42883). This
-- migration authors a real catalog + per-location stock, plus the read/write
-- RPCs the screen needs. Category-level sell-through is computed 100% from the
-- EXISTING real sales_logs table (id, node_id, category, amount, units,
-- sale_date). No per-SKU sales are invented — sales_logs has no product key, so
-- sales are reported honestly at the category level only.
--
-- Idempotent — safe to re-run. All RPCs SECURITY DEFINER with a pinned
-- search_path; reads are STABLE. RLS enabled on the new tables; the app reaches
-- them exclusively through these definer RPCs (matching the pin_login/anon
-- model used throughout this project).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.product_catalog (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  sku         text not null,
  name        text not null,
  category    text,
  cost        numeric(12,2) not null default 0,
  retail      numeric(12,2) not null default 0,
  msrp        numeric(12,2),
  comp_price  numeric(12,2),
  status      text not null default 'active',           -- active | out-of-stock | special-order | discontinued
  added_date  date not null default current_date,
  upsell_skus text[] not null default '{}'::text[],
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists product_catalog_sku_uidx on public.product_catalog (sku);

create table if not exists public.product_location_stock (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product_catalog(id) on delete cascade,
  node_id    uuid not null references public.org_nodes(id) on delete cascade,
  on_hand    integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, node_id)
);

create index if not exists product_location_stock_node_idx on public.product_location_stock (node_id);

alter table public.product_catalog        enable row level security;
alter table public.product_location_stock enable row level security;

-- ── 1) Full catalog with real per-location stock, scoped to the caller nodes ─
create or replace function public.get_products_catalog(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]'::jsonb)
  from (
    select
      pc.id,
      pc.sku,
      pc.name,
      pc.category                                  as cat,
      pc.cost,
      pc.retail,
      pc.msrp,
      pc.comp_price                                as comp,
      pc.status,
      to_char(pc.added_date, 'YYYY-MM-DD')         as "addedDate",
      pc.upsell_skus                               as "upsellPairs",
      coalesce(st.total, 0)                        as "totalStock",
      coalesce(st.by_loc, '{}'::jsonb)             as "locStock"
    from public.product_catalog pc
    left join lateral (
      select sum(s.on_hand)::int          as total,
             jsonb_object_agg(n.name, s.on_hand) as by_loc
      from public.product_location_stock s
      join public.org_nodes n on n.id = s.node_id
      where s.product_id = pc.id
        and s.node_id = any(p_node_ids)
    ) st on true
  ) x;
$$;

-- ── 2) Real category sell-through from sales_logs (honest, category-level) ───
create or replace function public.get_product_category_sales(
  p_node_ids uuid[],
  p_days     integer default 30
) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.amount desc nulls last), '[]'::jsonb)
  from (
    select
      sl.category                                                       as cat,
      round(coalesce(sum(sl.amount), 0), 2)                             as amount,
      coalesce(sum(sl.units), 0)::int                                   as units,
      round(coalesce(sum(sl.units), 0)::numeric / greatest(p_days / 7.0, 1), 1) as velocity,
      max(sl.sale_date)                                                 as "lastSale"
    from public.sales_logs sl
    where sl.node_id = any(p_node_ids)
      and sl.sale_date >= current_date - p_days
      and sl.category is not null
    group by sl.category
  ) x;
$$;

-- ── 3) Bulk price adjustment (real write) ───────────────────────────────────
create or replace function public.bulk_update_prices(
  p_skus       text[],
  p_pct_change numeric
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_count integer;
begin
  if p_skus is null or array_length(p_skus, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'no skus', 'updated', 0);
  end if;
  update public.product_catalog
     set retail     = round(retail * (1 + p_pct_change / 100.0), 2),
         updated_at = now()
   where sku = any(p_skus);
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'updated', v_count);
end;
$$;

-- ── 4) Create / edit a product (real write, upsert by sku) ───────────────────
create or replace function public.upsert_product(
  p_sku        text,
  p_name       text,
  p_category   text default null,
  p_cost       numeric default 0,
  p_retail     numeric default 0,
  p_msrp       numeric default null,
  p_comp_price numeric default null,
  p_status     text default 'active',
  p_upsell     text[] default '{}'::text[],
  p_tenant     uuid default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_sku), '') = '' or coalesce(trim(p_name), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'sku and name required');
  end if;
  insert into public.product_catalog
    (tenant_id, sku, name, category, cost, retail, msrp, comp_price, status, upsell_skus)
  values
    (p_tenant, p_sku, p_name, p_category, coalesce(p_cost, 0), coalesce(p_retail, 0),
     p_msrp, p_comp_price, coalesce(p_status, 'active'), coalesce(p_upsell, '{}'::text[]))
  on conflict (sku) do update
    set name        = excluded.name,
        category    = excluded.category,
        cost        = excluded.cost,
        retail      = excluded.retail,
        msrp        = excluded.msrp,
        comp_price  = excluded.comp_price,
        status      = excluded.status,
        upsell_skus = excluded.upsell_skus,
        updated_at  = now()
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── 5) Set product status (e.g. discontinue) (real write) ────────────────────
create or replace function public.set_product_status(
  p_sku    text,
  p_status text
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.product_catalog
     set status = p_status, updated_at = now()
   where sku = p_sku;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', v_count > 0, 'updated', v_count);
end;
$$;

-- ── 6) Set on-hand stock for a product at a node (real write) ─────────────────
create or replace function public.set_product_stock(
  p_sku     text,
  p_node_id uuid,
  p_on_hand integer
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_pid uuid;
begin
  select id into v_pid from public.product_catalog where sku = p_sku;
  if v_pid is null then
    return jsonb_build_object('ok', false, 'error', 'unknown sku');
  end if;
  insert into public.product_location_stock (product_id, node_id, on_hand, updated_at)
  values (v_pid, p_node_id, greatest(coalesce(p_on_hand, 0), 0), now())
  on conflict (product_id, node_id) do update
    set on_hand = excluded.on_hand, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants (RPC-only reach, matching the anon/pin_login model) ───────────────
grant execute on function public.get_products_catalog(uuid[])            to anon, authenticated;
grant execute on function public.get_product_category_sales(uuid[], integer) to anon, authenticated;
grant execute on function public.bulk_update_prices(text[], numeric)     to anon, authenticated;
grant execute on function public.upsert_product(text, text, text, numeric, numeric, numeric, numeric, text, text[], uuid) to anon, authenticated;
grant execute on function public.set_product_status(text, text)          to anon, authenticated;
grant execute on function public.set_product_stock(text, uuid, integer)  to anon, authenticated;
