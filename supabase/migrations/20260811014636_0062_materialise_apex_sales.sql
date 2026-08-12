-- ---------------------------------------------------------------------------
-- 0062 — Materialise the Apex sales lines.
--
-- v_forensic_sold_by_tag re-exploded the Apex jsonb for EVERY transfer line: 1,739
-- orders with nested item arrays, re-parsed once per each of 14,501 outbound rows.
-- That, not the transfer volume, is what timed out the dashboard.
--
-- order_id / line_id are APPENDED, not inserted in place: CREATE OR REPLACE VIEW
-- cannot rename or reorder existing columns.
--
-- Keyed on the Apex line id, because an invoice can legitimately carry the same
-- product at the same price twice.
-- ---------------------------------------------------------------------------
create or replace view v_forensic_sales as
select (o.payload->>'order_date')::date                        as order_date,
       o.payload->>'invoice_number'                            as invoice_number,
       nullif(o.payload->>'manifest_number','')                as manifest_number,
       o.payload->'buyer'->>'name'                             as buyer,
       o.payload->>'buyer_state_license'                       as buyer_licence,
       o.payload->'order_status'->'parent_status'->>'name'     as order_status,
       coalesce((o.payload->>'cancelled')::boolean,false)       as cancelled,
       o.payload->>'payment_status'                            as payment_status,
       (coalesce((o.payload->>'total_raw')::numeric,0)/100.0)         as total_usd,
       (coalesce((o.payload->>'subtotal_raw')::numeric,0)/100.0)      as subtotal_usd,
       (coalesce((o.payload->>'total_payments_raw')::numeric,0)/100.0) as paid_usd,
       it->>'product_name'                                     as product_name,
       it->'product_category'->>'name'                         as apex_category,
       f_product_line(it->>'product_name', it->'product_category'->>'name', null) as product_line,
       it->'cultivar'->>'name'                                 as strain,
       it->'operation'->>'state_license'                       as selling_licence,
       nullif(it->>'metrc_package_label','')                   as metrc_tag,
       coalesce((it->>'order_quantity')::numeric,0)             as qty,
       it->'order_unit_measurement'->>'name'                   as qty_uom,
       coalesce((it->>'units_per_case')::numeric,1)             as units_per_case,
       (coalesce((it->>'order_price_raw')::numeric,0)/100.0)    as line_price_usd,
       (o.payload->>'id')::bigint                              as order_id,
       (it->>'id')::bigint                                     as line_id
from apex_raw o
left join lateral jsonb_array_elements(coalesce(o.payload->'items','[]'::jsonb)) it on true
where o.entity = 'shipping-orders';

create materialized view mv_forensic_sales as select * from v_forensic_sales;

create unique index mv_fsales_uq       on mv_forensic_sales (order_id, line_id);
create index        mv_fsales_manifest on mv_forensic_sales (manifest_number);
create index        mv_fsales_buyer    on mv_forensic_sales (buyer_licence, order_date);

grant select on mv_forensic_sales to authenticated;

comment on materialized view mv_forensic_sales is
  'Apex shipping-order lines, materialised and indexed on manifest and on '
  'buyer licence + date -- the two keys the manifest-to-invoice match uses.';
;
