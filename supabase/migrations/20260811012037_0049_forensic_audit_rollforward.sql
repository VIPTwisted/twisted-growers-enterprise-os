-- ---------------------------------------------------------------------------
-- 0049 — THE ROLL-FORWARD. Any date range. Annual close for accountants.
--
-- Opening + additions - reductions = closing, every line from a DIFFERENT source,
-- so the schedule is capable of failing to balance. That is the whole point.
-- Contrast the harvest moisture figure (wet - waste - packaged = moisture loss),
-- which closes to 0.0000 by definition and would close on fabricated numbers.
-- It is an identity, it proves only that four fields are arithmetically
-- consistent, and it must never be presented as a reconciliation.
-- ---------------------------------------------------------------------------

create or replace function f_inventory_rollforward(
  p_from      date,
  p_to        date,
  p_licence   text    default null,
  p_ours_only boolean default false)
returns table (
  line_no   int, section text, line_item text,
  packages  bigint, pounds numeric, sign text, basis text)
language sql stable as $$
with ev as (
  select * from v_package_event_class e
  where (p_licence is null or e.licence = p_licence)
    and (not p_ours_only or e.is_ours)
),
opening as (select coalesce(sum(lb_delta),0) lb from ev where event_date <  p_from),
closing as (select coalesce(sum(lb_delta),0) lb from ev where event_date <= p_to),
win as (select * from ev where event_date between p_from and p_to),
agg as (select event_class, count(distinct package_tag) n, sum(lb_delta) lb
        from win group by 1),
v as (select event_class, n, lb from agg)
select 1, 'OPENING', 'On hand at close of ' || to_char(p_from - 1,'DD Mon YYYY'),
       null::bigint, round((select lb from opening)::numeric,1), '=',
       'Derived from every recorded event before the window opened'
union all
select 2,'ADDITIONS','Produced from our own harvests',n,round(lb::numeric,1),'+',
       'NEW MASS. Packaged directly off a harvest batch.' from v where event_class='PRODUCED_FROM_HARVEST'
union all
select 3,'ADDITIONS','Received in (purchases, returns, inbound)',n,round(lb::numeric,1),'+',
       'Inbound manifest leg where we are the destination licence' from v where event_class='RECEIVED'
union all
select 4,'ADDITIONS','Output of manufacturing (re-packaged)',n,round(lb::numeric,1),'+',
       'NOT new mass. Nets against line 7; counting it as inventory double-counts.'
       from v where event_class='CREATED_FROM_PACKAGE'
union all
select 5,'ADDITIONS','Created with no recorded source',n,round(lb::numeric,1),'+',
       'EXCEPTION: neither a harvest nor a parent package' from v where event_class='CREATED_NO_SOURCE'
union all
select 6,'REDUCTIONS','Shipped out on a manifest',n,round(lb::numeric,1),'-',
       'Outbound manifest leg where we are the origin licence' from v where event_class='SHIPPED'
union all
select 7,'REDUCTIONS','Consumed as manufacturing input',n,round(lb::numeric,1),'-',
       'Drawn down by a child package. Multi-parent splits PRO-RATA (assumption, not measurement).'
       from v where event_class='CONSUMED INTO CHILD'
union all
select 8,'REDUCTIONS','Adjustments: waste, destruction, corrections',n,round(lb::numeric,1),'+/-',
       'Signed exactly as Metrc recorded it' from v where event_class='ADJUSTED'
union all
select 9,'CLOSING','On hand at close of ' || to_char(p_to,'DD Mon YYYY'),
       null::bigint, round((select lb from closing)::numeric,1),'=',
       'Opening plus every movement inside the window'
union all
select 10,'DERIVED','Manufacturing process loss',null::bigint,
       round((coalesce((select -lb from v where event_class='CONSUMED INTO CHILD'),0)
            - coalesce((select  lb from v where event_class='CREATED_FROM_PACKAGE'),0))::numeric,1),'=',
       'Mass in less mass out of conversions. Metrc never tags this; derivable ONLY as a residual.'
order by 1;
$$;

grant execute on function f_inventory_rollforward to authenticated;


-- ON HAND BY PHYSICAL LOCATION, as at the moment the report is pulled.
-- Every open package sits in exactly one room, so this MUST sum to the on-hand total.
create or replace view v_forensic_onhand_by_location as
select coalesce(nullif(p.raw->>'LocationName',''),'(NO ROOM RECORDED)') as room,
       coalesce(r.role,'unmapped')                                       as room_role,
       p.license                                                          as licence,
       coalesce(nullif(p.raw->>'ProductCategoryName',''),'(uncategorised)') as category,
       f_product_line(p.raw->>'ProductName', p.raw->>'ProductCategoryName', null) as product_line,
       f_is_ours(coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''), p.license)) as is_ours,
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(unknown)')    as grown_or_processed_by,
       count(*)                                                          as packages,
       round(sum(f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0),
             coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')))::numeric,3) as pounds
from metrc_packages p
left join room_roles r on upper(btrim(r.room_name)) = upper(btrim(p.raw->>'LocationName'))
where not coalesce((p.raw->>'IsFinished')::boolean,false)
  and f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
  and coalesce((p.raw->>'Quantity')::numeric,0) > 0
group by 1,2,3,4,5,6,7;

comment on view v_forensic_onhand_by_location is
  'Where every pound physically sits RIGHT NOW. Each open package has exactly one '
  'LocationName, so this sums to total on hand with no overlap. Third-party material '
  'is separated by is_ours and always carries the company that grew or processed it.';

grant select on v_forensic_onhand_by_location to authenticated;


-- SALES, from Apex -- the owner's designated record of truth for sales and accounting.
-- Metrc is seed-to-sale compliance and holds the manifest; it is NOT the sales ledger.
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
       (coalesce((it->>'order_price_raw')::numeric,0)/100.0)    as line_price_usd
from apex_raw o
left join lateral jsonb_array_elements(coalesce(o.payload->'items','[]'::jsonb)) it on true
where o.entity = 'shipping-orders';

comment on view v_forensic_sales is
  'Apex shipping-orders exploded to line level. APEX IS THE RECORD OF TRUTH FOR SALES '
  'AND ACCOUNTING -- Metrc holds the manifest, not the invoice. Money fields ending '
  '_raw are integer CENTS in the Apex API and are divided by 100 here.';

grant select on v_forensic_sales to authenticated;
;
