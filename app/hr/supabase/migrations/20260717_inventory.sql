-- ─────────────────────────────────────────────────────────────────────────────
-- Inventory screen — history read RPCs
-- ─────────────────────────────────────────────────────────────────────────────
-- The Inventory screen already writes through existing definer functions:
--   receive_inventory(p_sku,p_location,p_qty,p_supplier,p_po,p_date,p_notes)
--   transfer_inventory(p_sku,p_from,p_to,p_qty)
--   log_supply_request(p_item,p_node_id,p_qty,p_requester_id,p_unit,p_urgency)
-- and reads current stock through get_inventory(p_node_ids).
--
-- What was missing were READ functions for the receipt / transfer / restock
-- history logs (the UI previously faked those with in-memory mock arrays).
-- These three functions surface the real history from the existing tables
-- (inventory_adjustments, supply_requests) joined to inventory_items + org_nodes.
--
-- No new tables are created and NO RLS is toggled on the shared tables
-- (they are already governed and accessed exclusively through definer RPCs;
-- blanket-enabling RLS here would black out other consumers). This migration
-- only adds/refreshes security-definer read functions + their grants.
-- Idempotent: safe to re-run.

-- Recent stock receipts (positive, non-transfer adjustments) ------------------
create or replace function public.get_inventory_receipts(p_node_ids uuid[] default null)
returns table (
  id        uuid,
  date      timestamptz,
  sku       text,
  product   text,
  category  text,
  location  text,
  qty       numeric,
  unit_cost numeric,
  cost      numeric,
  reason    text
)
language sql
security definer
set search_path = public
as $$
  select a.id,
         a.adjusted_at                               as date,
         i.sku,
         i.name                                      as product,
         i.category,
         n.name                                      as location,
         a.quantity_change                           as qty,
         i.unit_cost,
         (a.quantity_change * coalesce(i.unit_cost, 0)) as cost,
         a.reason
    from inventory_adjustments a
    join inventory_items i on i.id = a.item_id
    left join org_nodes  n on n.id = a.node_id
   where a.quantity_change > 0
     and coalesce(a.adjustment_type, '') not ilike '%transfer%'
     and (p_node_ids is null or array_length(p_node_ids, 1) is null or a.node_id = any (p_node_ids))
   order by a.adjusted_at desc nulls last
   limit 100;
$$;

-- Recent stock transfers (legs of cross-location moves) ----------------------
create or replace function public.get_inventory_transfers(p_node_ids uuid[] default null)
returns table (
  id        uuid,
  date      timestamptz,
  sku       text,
  product   text,
  category  text,
  location  text,
  qty       numeric,
  direction text,
  reason    text
)
language sql
security definer
set search_path = public
as $$
  select a.id,
         a.adjusted_at                                       as date,
         i.sku,
         i.name                                              as product,
         i.category,
         n.name                                              as location,
         abs(a.quantity_change)                              as qty,
         case when a.quantity_change < 0 then 'out' else 'in' end as direction,
         a.reason
    from inventory_adjustments a
    join inventory_items i on i.id = a.item_id
    left join org_nodes  n on n.id = a.node_id
   where coalesce(a.adjustment_type, '') ilike '%transfer%'
     and (p_node_ids is null or array_length(p_node_ids, 1) is null or a.node_id = any (p_node_ids))
   order by a.adjusted_at desc nulls last
   limit 100;
$$;

-- Restock / supply requests log ----------------------------------------------
create or replace function public.get_supply_requests(p_node_ids uuid[] default null)
returns table (
  id       uuid,
  date     timestamptz,
  item     text,
  qty      numeric,
  unit     text,
  urgency  text,
  status   text,
  location text,
  notes    text
)
language sql
security definer
set search_path = public
as $$
  select s.id,
         s.requested_at    as date,
         s.item_name       as item,
         s.quantity_needed as qty,
         s.unit,
         s.urgency,
         s.status,
         n.name            as location,
         s.notes
    from supply_requests s
    left join org_nodes n on n.id = s.node_id
   where (p_node_ids is null or array_length(p_node_ids, 1) is null or s.node_id = any (p_node_ids))
   order by s.requested_at desc nulls last
   limit 100;
$$;

grant execute on function public.get_inventory_receipts(uuid[]) to anon, authenticated;
grant execute on function public.get_inventory_transfers(uuid[]) to anon, authenticated;
grant execute on function public.get_supply_requests(uuid[])     to anon, authenticated;
