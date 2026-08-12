-- Agent I (Database COO), 12 Aug 2026. DBI-047 v2 (reviewers V, X, W).
-- v2: create-or-replace cannot reorder existing view columns, so the new columns are APPENDED
-- in the original order - the same constraint that caught me on v_figure_disagreement. No DROP.
--
-- Owner: "we must track how many to keep on hand, and reorder point, and on order."
-- RULE 12: purchase_orders / purchase_order_lines already exist with the right shape (po_code,
-- vendor, ordered_on, promised_on, received_on, status; per-line qty, received_good/damaged/
-- short). Supplies wire THROUGH them - one procurement spine, not a parallel supply-only table
-- that would immediately disagree with it.
--
-- TWO OF THE THREE NUMBERS ARE CALCULATED, NOT GUESSED:
--   ON ORDER      = open PO lines less what has been received.
--   REORDER POINT = average daily usage x lead time + safety stock.
--   KEEP ON HAND  = usage x (lead time + review period) + safety stock; review period defaults
--                   to 30 days and is overridable per item via supply_items.cover_days.
-- Both are computable only because consumption is now MEASURED from Metrc production (DBI-046).
-- The platform recommends; the owner confirms into reorder_level/safety_stock; until then they
-- are labelled recommendations (A2 - a number nobody set must say so).
--
-- AVAILABLE = on hand + on order, because ordering against on-hand alone is how a company
-- orders the same boxes twice.
--
-- SAFETY STOCK, HONESTLY: no demand-variability history exists yet, so the recommendation uses
-- a flat 25% of lead-time demand - said plainly rather than dressed up as a service level. It
-- tightens when there is history.
--
-- UNDO: restore v_supply_position from packaging_supply_consumption_loop_v2;
--       drop view v_supply_reorder_board;
--       alter table purchase_order_lines drop column supply_item_id.

alter table purchase_order_lines add column if not exists supply_item_id uuid references supply_items(id);

comment on column purchase_order_lines.supply_item_id is
 'Links a purchase-order line to a packaging supply item (boxes, labels, tubes, ink) so ON ORDER '
 'comes from the one procurement spine rather than a parallel supply-only table.';

create index if not exists pol_supply_item on purchase_order_lines (supply_item_id);

create or replace view public.v_supply_position as
with on_order as (
  select l.supply_item_id,
         sum(greatest(coalesce(l.qty,0) - coalesce(l.received_good,0) - coalesce(l.received_damaged,0), 0)) as qty_on_order,
         min(coalesce(po.promised_on, po.required_on)) as next_arrival,
         string_agg(distinct po.po_code, ', ')         as open_pos
  from purchase_order_lines l
  join purchase_orders po on po.id = l.purchase_order_id
  where l.supply_item_id is not null
    and coalesce(po.status,'open') not in ('received','cancelled','closed')
  group by l.supply_item_id
)
select s.name as supply_item, s.category, s.unit,
       s.on_hand, s.reorder_level, s.safety_stock, s.lead_time_days, s.cost_per_unit,
       c.consumed_30d, c.avg_monthly_90d, c.rate_is_provisional,
       case when c.avg_monthly_90d > 0 and s.on_hand is not null
            then round((s.on_hand + coalesce(o.qty_on_order,0)) / (c.avg_monthly_90d / 30.0), 1) end as days_of_cover,
       case when s.on_hand is not null and c.avg_monthly_90d > 0 and s.lead_time_days is not null
            then round(c.avg_monthly_90d / 30.0 * s.lead_time_days, 0) end as needed_during_lead_time,
       round(coalesce(c.consumed_30d,0) * coalesce(s.cost_per_unit,0), 2)  as spend_30d,
       case
         when c.avg_monthly_90d is null or c.avg_monthly_90d = 0 then
           'NO CONSUMPTION RULE — nothing tells the platform what draws this item down, so it cannot say when to reorder.'
         when s.on_hand is null then
           'ON HAND NOT COUNTED — usage is measured at ' || round(c.avg_monthly_90d/30.0,1) ||
           '/day, so the moment somebody counts this shelf the reorder point and keep-on-hand level compute themselves.'
         when (s.on_hand + coalesce(o.qty_on_order,0)) <=
              round(c.avg_monthly_90d / 30.0 * coalesce(s.lead_time_days,14)
                    + coalesce(s.safety_stock, c.avg_monthly_90d/30.0*coalesce(s.lead_time_days,14)*0.25), 0)
              then 'REORDER NOW — on hand plus on order is at or below the reorder point'
         when coalesce(o.qty_on_order,0) > 0 then
           'ON ORDER — ' || o.qty_on_order || ' arriving' || coalesce(' ' || to_char(o.next_arrival,'DD Mon'), '')
         else 'OK'
       end as status,
       -- appended (create-or-replace cannot reorder existing columns)
       s.vendor,
       coalesce(o.qty_on_order, 0)                    as on_order,
       s.on_hand + coalesce(o.qty_on_order, 0)        as available,
       o.next_arrival,
       o.open_pos,
       round(c.avg_monthly_90d / 30.0, 1)             as avg_daily_usage,
       round(c.avg_monthly_90d / 30.0 * coalesce(s.lead_time_days, 14)
             + coalesce(s.safety_stock, c.avg_monthly_90d / 30.0 * coalesce(s.lead_time_days,14) * 0.25), 0)
                                                      as reorder_point_recommended,
       round(c.avg_monthly_90d / 30.0 * (coalesce(s.lead_time_days, 14) + coalesce(s.cover_days, 30))
             + coalesce(s.safety_stock, c.avg_monthly_90d / 30.0 * coalesce(s.lead_time_days,14) * 0.25), 0)
                                                      as keep_on_hand_recommended
from supply_items s
left join v_supply_consumption c on c.supply_item_id = s.id
left join on_order o             on o.supply_item_id = s.id;

comment on view public.v_supply_position is
 'Packaging supply, complete: on hand · ON ORDER (open PO lines less received) · available · '
 'measured consumption · CALCULATED reorder point (lead-time demand + safety stock) and '
 'CALCULATED keep-on-hand level (demand over lead time + review period + safety stock). The '
 'platform recommends both from real usage; the owner confirms them into reorder_level and '
 'safety_stock, and until then they are labelled recommendations. Available counts on-order '
 'because ordering against on-hand alone is how a company orders the same boxes twice. Safety '
 'stock defaults to 25% of lead-time demand with no variability history yet - stated plainly, '
 'tightened later.';

create or replace view public.v_supply_reorder_board as
select supply_item, category, vendor, unit,
       on_hand, on_order, available,
       reorder_point_recommended as reorder_at,
       keep_on_hand_recommended  as keep_on_hand,
       greatest(coalesce(keep_on_hand_recommended,0) - coalesce(available,0), 0) as order_this_many,
       round(greatest(coalesce(keep_on_hand_recommended,0) - coalesce(available,0), 0)
             * coalesce(cost_per_unit,0), 2)                                     as order_cost,
       avg_daily_usage, days_of_cover, next_arrival, open_pos, rate_is_provisional, status
from v_supply_position
order by case when status like 'REORDER NOW%' then 1 when status like 'ON HAND NOT COUNTED%' then 2
              when status like 'ON ORDER%' then 3 else 4 end,
         coalesce(days_of_cover, 9999);

comment on view public.v_supply_reorder_board is
 'The purchasing screen: what to order, how many, from whom, and what it costs - order_this_many '
 'is the keep-on-hand level less on hand and less what is already on order. REORDER NOW sorts '
 'first, uncounted shelves second, because an uncounted shelf is the only thing standing between '
 'this board and running itself.';;
