-- Agent G, 10 Aug 2026. MY OWN DEFECT, caught by the owner's instruction that it must balance.
--
-- 1,188 sale manifests, and the statuses summed to 1,123. The missing 65 are manifests that
-- HAVE a matched Apex order but NO priced line in the Metrc wholesale export, so declared is
-- NULL. In SQL, NULL comparisons are neither true nor false: abs(apex - null) <= tolerance is
-- null, apex > null is null, and the CASE therefore fell through to its ELSE and labelled all
-- 65 "Metrc declares more than Apex sold" - the exact opposite of the truth, since Metrc
-- declares nothing at all on them. value_gap was also null, so they were invisible to the
-- audit list: mislabelled AND unauditable.
--
-- This is the three-valued-logic trap, and the only reason it surfaced is that the owner said
-- the parts must add up to the whole. A status set that does not sum to its population is
-- always hiding something; here it was hiding 65 rows in the direction that flatters us.
--
-- UNDO: restore the previous CASE, which lacked the "declared is null" branch.

create or replace view v_manifest_reconciliation as
with man as (
  select distinct on (manifest_number)
         manifest_number, created_on, received_on, destination_licence, destination_facility
  from metrc_rpt_transfer_manifests
  where direction = 'outbound'
  order by manifest_number, created_on
),
kind as (
  select m.*,
         case when m.destination_licence is null        then 'UNKNOWN DESTINATION'
              when f_is_ours(m.destination_licence)     then 'INTERNAL TRANSFER'
              when left(m.destination_licence,2) = 'IL' then 'LABORATORY SAMPLE'
              when left(m.destination_licence,2) = 'MX' then 'TRANSPORTER'
              else 'SALE' end as destination_kind
  from man m
),
money as (
  select w.manifest_number,
         round(sum(w.amount) filter (where not w.voided and w.amount >= 1.00), 2) declared,
         count(*) filter (where not w.voided and w.amount >= 1.00) money_lines,
         count(*) filter (where w.voided) voided_lines,
         count(*) filter (where w.amount < 1.00) placeholder_lines,
         max(nullif(btrim(w.invoice_number),'')) invoice_number
  from metrc_rpt_wholesale w group by 1
),
pkgs as (
  select manifest_number, count(distinct package_tag) package_tags
  from metrc_rpt_package_transfers group by 1
),
apex as (
  select regexp_replace(payload->>'invoice_number','\D','','g') d,
         min(nullif(payload->>'order_date','')::date)        apex_order_date,
         min(nullif(payload->>'delivery_date','')::date)     apex_delivery_date,
         round(sum((payload->>'subtotal_raw')::numeric)/100, 2) apex_value,
         count(*) apex_orders,
         string_agg(distinct btrim(payload->>'invoice_number'), ', ') apex_invoices
  from apex_raw
  where entity = 'shipping-orders'
    and (payload->>'cancelled') in ('','0','false')
    and jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) > 0
  group by 1
)
select k.manifest_number,
       k.created_on as metrc_date, k.received_on as metrc_received,
       k.destination_licence, k.destination_facility, k.destination_kind,
       mo.invoice_number as metrc_invoice_number,
       mo.declared as metrc_declared,
       mo.money_lines, mo.voided_lines, mo.placeholder_lines,
       coalesce(p.package_tags, 0) as package_tags,
       a.apex_invoices, a.apex_order_date, a.apex_delivery_date, a.apex_value, a.apex_orders,
       (coalesce(a.apex_delivery_date, a.apex_order_date) - k.created_on) as date_gap_days,
       round(a.apex_value - mo.declared, 2) as value_gap,
       case
         when k.destination_kind <> 'SALE'
           then 'NOT A SALE — ' || k.destination_kind
         when k.created_on < date '2025-01-30'
           then 'BEFORE THE KEY EXISTED — Metrc carried no invoice number until 2025-01-30'
         when mo.invoice_number is null
           then 'NO INVOICE NUMBER on the Metrc record'
         when a.d is null
           then 'NO APEX ORDER for this invoice number'
         /* THE BRANCH THAT WAS MISSING. Must precede every comparison, because a NULL
            declared makes each of them null and the CASE falls to its ELSE. */
         when mo.declared is null
           then 'NO METRC VALUE — Apex order matched but the manifest has no priced line'
         when abs(a.apex_value - mo.declared)
              <= (select value from conversion_factors where key='apex_metrc_rounding_tolerance_usd')
           then 'RECONCILED'
         when a.apex_value > mo.declared then 'VALUE DIFFERS — Apex sold more than Metrc declares'
         else                                 'VALUE DIFFERS — Metrc declares more than Apex sold'
       end as status
from kind k
left join money mo on mo.manifest_number = k.manifest_number
left join pkgs  p  on p.manifest_number  = k.manifest_number
left join apex  a  on a.d = regexp_replace(coalesce(mo.invoice_number,''), '\D', '', 'g')
                  and mo.invoice_number is not null;;
