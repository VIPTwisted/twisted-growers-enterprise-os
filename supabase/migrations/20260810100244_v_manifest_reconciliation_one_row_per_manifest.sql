-- Agent G, 10 Aug 2026. ONE ROW PER OUTBOUND MANIFEST, BOTH SIDES, DATE FOR DATE.
-- Owner: "parse from first manifest in Metrc, first manifest and order in Apex date for date
-- and list discrepancy for each manifest."
--
-- THE TIMELINE THIS IS ANCHORED ON, measured 10 Aug 2026:
--   2024-01-20  Metrc: first outbound manifest of any kind — a LABORATORY transfer, not a sale
--   2024-06-22  Metrc: first manifest to an outside company, and first wholesale money record
--   2024-09-20  Apex:  first live order
--   2025-01-30  Metrc: first wholesale record CARRYING an invoice number — and, the same day,
--               the first Apex order that can match one. Before this date the join key does
--               not exist on the Metrc side, so nothing earlier is matchable BY CONSTRUCTION.
--               That is why the status below distinguishes "before the key existed" from
--               "unmatched": they are not the same fact and must never be counted together.
--
-- DUPLICATE ROWS. metrc_rpt_transfer_manifests holds 4,072 outbound rows for 2,355 distinct
-- manifests from a single import, and neither as_of_date nor licence separates them - 1,717
-- are duplicates. Every aggregate here is built on DISTINCT manifest_number for that reason;
-- summing the table directly double-counts by roughly 73%.
--
-- UNDO: drop view v_manifest_discrepancy_summary; drop view v_manifest_reconciliation;

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
         case when m.destination_licence is null                  then 'UNKNOWN DESTINATION'
              when f_is_ours(m.destination_licence)               then 'INTERNAL TRANSFER'
              when left(m.destination_licence,2) = 'IL'           then 'LABORATORY SAMPLE'
              when left(m.destination_licence,2) = 'MX'           then 'TRANSPORTER'
              else 'SALE' end as destination_kind
  from man m
),
money as (            -- the Metrc money side, per manifest
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
apex as (             -- the Apex side, keyed on the normalised invoice number
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
       k.created_on                                   as metrc_date,
       k.received_on                                  as metrc_received,
       k.destination_licence,
       k.destination_facility,
       k.destination_kind,
       mo.invoice_number                              as metrc_invoice_number,
       mo.declared                                    as metrc_declared,
       mo.money_lines,
       mo.voided_lines,
       mo.placeholder_lines,
       coalesce(p.package_tags, 0)                    as package_tags,
       a.apex_invoices,
       a.apex_order_date,
       a.apex_delivery_date,
       a.apex_value,
       a.apex_orders,
       (coalesce(a.apex_delivery_date, a.apex_order_date) - k.created_on) as date_gap_days,
       round(a.apex_value - mo.declared, 2)           as value_gap,
       case
         when k.destination_kind <> 'SALE'
           then 'NOT A SALE — ' || k.destination_kind
         when k.created_on < date '2025-01-30'
           then 'BEFORE THE KEY EXISTED — Metrc carried no invoice number until 2025-01-30'
         when mo.invoice_number is null
           then 'NO INVOICE NUMBER on the Metrc record'
         when a.d is null
           then 'NO APEX ORDER for this invoice number'
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
                  and mo.invoice_number is not null;

alter view v_manifest_reconciliation set (security_invoker = on);

comment on view v_manifest_reconciliation is
  'One row per outbound Metrc manifest, with the Apex order beside it, date for date. Anchored '
  'on DISTINCT manifest_number because the register holds 4,072 outbound rows for 2,355 '
  'manifests and 1,717 are duplicates. status separates four things that are NOT the same and '
  'must never be summed into one coverage figure: a manifest that is not a sale at all '
  '(internal transfer or laboratory sample), one predating 2025-01-30 when Metrc first carried '
  'an invoice number and matching was therefore impossible, one genuinely unmatched, and one '
  'reconciled within the owner-set tolerance. value_gap is Apex minus Metrc declared - a Metrc '
  'figure is a DECLARED TRANSFER PRICE, a regulatory filing, and legitimately differs from what '
  'was sold.';

create or replace view v_manifest_discrepancy_summary as
select status,
       count(*)                                        manifests,
       min(metrc_date)                                 from_date,
       max(metrc_date)                                 to_date,
       round(sum(metrc_declared), 2)                   metrc_declared,
       round(sum(apex_value), 2)                       apex_value,
       round(sum(value_gap), 2)                        net_gap,
       sum(package_tags)                               package_tags,
       round(avg(date_gap_days), 1)                    avg_date_gap_days
from v_manifest_reconciliation
group by 1;

alter view v_manifest_discrepancy_summary set (security_invoker = on);

comment on view v_manifest_discrepancy_summary is
  'v_manifest_reconciliation rolled up by status. Read NOT A SALE and BEFORE THE KEY EXISTED as '
  'excluded populations with a named reason, never as failures - together they are most of the '
  'register, and folding them into a coverage percentage would understate it badly.';;
