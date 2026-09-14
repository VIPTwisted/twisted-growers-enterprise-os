-- ═══════════════════════════════════════════════════════════════════════════
-- Merch / Company Store backend (src/screens/Merch.jsx)
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- The Merch screen previously rendered a 15-row hardcoded catalog (MERCH_ITEMS)
-- and an 18-row seed()/EMPLOYEES mock order history (buildMockOrders), and fell
-- back to that mock whenever the real read returned empty. This migration wires
-- the screen to the REAL, already-existing tables:
--
--   merch_catalog : id(uuid) name category price(numeric) description
--                   is_active image_url stock_qty(int) tenant_id created_at
--   merch_orders  : id person_id item_id item_name quantity status notes
--                   node_id tenant_id total_cost(numeric) ordered_by
--                   reviewed_by created_at updated_at
--
-- Both tables exist and are honestly EMPTY (no fake rows are seeded here — the
-- screen now shows honest empty states until real data is entered). The catalog
-- read RPC that already existed (get_merchandise_catalog) is not granted to anon
-- (42501) and does not expose the merchandising fields the storefront needs, so
-- purpose-built definer RPCs are authored here for a known, stable shape.
--
-- Additive, idempotent columns are added so the storefront's size selector,
-- "provided by company" badge and item glyph are data-driven (null-safe in UI).
--
-- Reused, verified-existing RPCs (unchanged, still called by the screen):
--   bulk_update_order_status(p_order_ids uuid[], p_status text)  -> {ok,updated}
--   request_merch_restock(p_item_id, p_quantity)
--
-- Idempotent — safe to re-run. All new RPCs SECURITY DEFINER with a pinned
-- search_path; reads STABLE. The app reaches these pre-existing tables
-- exclusively through the definer RPCs below (matching the pin_login/anon model
-- used throughout this project). RLS on the pre-existing tables is left as-is
-- (see note below) to avoid regressing existing consumers.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Additive merchandising columns (idempotent, null-safe) ───────────────────
alter table public.merch_catalog add column if not exists sizes      text[];
alter table public.merch_catalog add column if not exists is_company boolean not null default false;
alter table public.merch_catalog add column if not exists emoji      text;

alter table public.merch_orders  add column if not exists size       text;

-- NOTE: RLS is intentionally NOT toggled on these pre-existing tables. They
-- already have live consumers (bulk_update_order_status, request_merch_restock)
-- whose security mode is not verified here; flipping RLS could black those out.
-- The screen reaches the data exclusively through the SECURITY DEFINER RPCs
-- below, which are unaffected by the tables' RLS state.

-- ── 1) Storefront catalog, scoped to the caller's tenant(s) ──────────────────
create or replace function public.hr_merch_catalog(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]'::jsonb)
  from (
    select
      mc.id,
      mc.name,
      mc.category                                as cat,
      mc.price,
      coalesce(mc.is_company, false)             as company,
      coalesce(mc.sizes, array['One Size'])      as sizes,
      mc.emoji,
      mc.description                             as "desc",
      mc.image_url,
      mc.stock_qty                               as "stockQty",
      mc.created_at,
      (mc.stock_qty is not null and mc.stock_qty < 4) as "lowStock"
    from public.merch_catalog mc
    where coalesce(mc.is_active, true)
      and (
        p_node_ids is null
        or array_length(p_node_ids, 1) is null
        or mc.tenant_id is null
        or mc.tenant_id in (
          select distinct n.tenant_id from public.org_nodes n
          where n.id = any(p_node_ids)
        )
      )
  ) x;
$$;

-- ── 2) All merch orders visible to the caller's nodes (joined, known shape) ───
create or replace function public.hr_merch_orders(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ordered_at desc), '[]'::jsonb)
  from (
    select
      mo.id,
      mo.person_id,
      coalesce(pe.display_name, pe.full_name, 'Employee') as employee_name,
      coalesce(n.name, '')                        as location,
      mo.item_id,
      mo.item_name,
      mc.emoji                                    as item_emoji,
      mc.category                                 as cat,
      mo.size,
      mo.quantity,
      round(
        coalesce(mc.price,
          case when coalesce(mo.quantity, 0) > 0
               then mo.total_cost / mo.quantity else 0 end
        ), 2)                                     as price,
      mo.total_cost                               as value,
      coalesce(mo.status, 'Pending')              as status,
      null::text                                  as tracking_number,
      mo.created_at                               as ordered_at,
      mo.notes
    from public.merch_orders mo
    left join public.people      pe on pe.id = mo.person_id
    left join public.org_nodes   n  on n.id  = mo.node_id
    left join public.merch_catalog mc on mc.id = mo.item_id
    where p_node_ids is null
       or array_length(p_node_ids, 1) is null
       or mo.node_id = any(p_node_ids)
  ) x;
$$;

-- ── 3) Place a merch order (real write) ──────────────────────────────────────
-- Derives item name/price/tenant from the catalog and the ordering node from the
-- person's most-recent assignment, so the client only supplies what it knows.
create or replace function public.hr_place_merch_order(
  p_person_id uuid,
  p_item_id   uuid,
  p_quantity  integer,
  p_size      text default null,
  p_notes     text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id      uuid;
  v_name    text;
  v_price   numeric;
  v_tenant  uuid;
  v_node    uuid;
  v_qty     integer := greatest(coalesce(p_quantity, 1), 1);
begin
  if p_person_id is null or p_item_id is null then
    return jsonb_build_object('ok', false, 'error', 'person and item required');
  end if;

  select mc.name, coalesce(mc.price, 0), mc.tenant_id
    into v_name, v_price, v_tenant
    from public.merch_catalog mc
   where mc.id = p_item_id;

  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'unknown item');
  end if;

  -- ordering node: most recent assignment for this person
  select a.node_id into v_node
    from public.assignments a
   where a.person_id = p_person_id
   order by a.effective_from desc nulls last
   limit 1;

  -- fallback: a location node in the item's tenant
  if v_node is null then
    select n.id into v_node
      from public.org_nodes n
     where (v_tenant is null or n.tenant_id = v_tenant)
       and n.node_type = 'location'
     order by n.name
     limit 1;
  end if;

  insert into public.merch_orders
    (person_id, item_id, item_name, quantity, size, status,
     notes, node_id, tenant_id, total_cost, ordered_by)
  values
    (p_person_id, p_item_id, v_name, v_qty, nullif(p_size, ''), 'Pending',
     nullif(p_notes, ''), v_node, v_tenant, round(v_price * v_qty, 2), p_person_id)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── Grants (RPC-only reach, matching the anon/pin_login model) ───────────────
grant execute on function public.hr_merch_catalog(uuid[])                       to anon, authenticated;
grant execute on function public.hr_merch_orders(uuid[])                        to anon, authenticated;
grant execute on function public.hr_place_merch_order(uuid, uuid, integer, text, text) to anon, authenticated;
