-- Owner told me the API is expensive and I confirmed the shape of the bill from
-- Apex's own usage screen on 11 Aug 2026:
--   top-level 3,854 · BILLABLE NESTED 14,367 · 62.9 MB · 61% STALE
-- Nested is 79% of the bill - roughly 4 billable nested resources for every record,
-- because 1,739 shipping orders drag 13,135 line items and their payments behind them.
--
-- SPLIT THE PULL. The two nested sets move on completely different clocks:
--   with_items    changes when an order is edited. It carries the revenue, the unit
--                 price and the package label, so it is not optional.
--   with_payments changes when money arrives - on net terms, days or weeks later,
--                 and NEVER as a side effect of editing an order.
-- Riding payments along on every order pull meant paying for AR data that had not
-- moved. Payments now come from the dedicated sub-resource on a slower cadence.
--
-- All of this is DATA, not code, so it takes effect on the next run with no deploy -
-- which is the reason the cost controls were built as columns in the first place.

update public.apex_entity
set nesting = '{"with_items":"true"}'::jsonb,
    min_interval_minutes = 120
where entity = 'shipping-orders';

-- Receiving orders are purchases; they change far less often than sales and were on
-- the same hourly clock for no reason.
update public.apex_entity
set nesting = '{}'::jsonb,
    min_interval_minutes = 720
where entity = 'receiving-orders';

-- Available inventory is the one thing that genuinely moves hourly, and it carries
-- no nesting at all - so it stays frequent and stays cheap.
update public.apex_entity
set min_interval_minutes = 60
where entity = 'available-inventory';

comment on column public.apex_entity.nesting is
  'Opt-in query params for nested resources. EACH NESTED RESOURCE IS BILLABLE and nesting was 79% of the Apex bill on 11 Aug 2026. Add one ONLY when something downstream needs it on the SAME cadence as the parent - with_payments was removed from shipping-orders precisely because money arrives on net terms, not when an order is edited.';

select entity, min_interval_minutes as every_mins, nesting::text
from public.apex_entity
where entity in ('shipping-orders','receiving-orders','available-inventory')
order by entity;;
