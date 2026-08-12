-- 0063 — Point the sold-by-tag view at the materialised, indexed Apex sales.
-- Same columns in the same order (CREATE OR REPLACE forbids reordering).
create or replace view v_forensic_sold_by_tag as
select t.received_on                                   as shipped_on,
       t.manifest_number,
       t.package_tag,
       t.item,
       t.category,
       t.strain,
       f_product_line(t.item, t.category, null)         as product_line,
       t.shipped_lb                                    as pounds,
       coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence)   as sold_by_licence,
       t.source_row->>'Origin Facility'                as sold_by_facility,
       t.destination_licence                           as buyer_licence,
       t.destination_facility                          as buyer,
       f_is_ours(t.destination_licence)                as internal_transfer,
       t.status,
       t.source_row->>'Type'                           as transfer_type,
       a.invoice_number,
       a.total_usd,
       a.payment_status,
       case when a.invoice_number is not null then 'matched' else 'NO APEX INVOICE' end as invoice_match
from metrc_rpt_package_transfers t
left join lateral (
  select s.invoice_number, s.total_usd, s.payment_status
  from mv_forensic_sales s
  where not s.cancelled
    and (s.manifest_number = t.manifest_number
         or (s.buyer_licence = t.destination_licence
             and s.order_date between t.received_on - 7 and t.received_on + 7))
  order by (s.manifest_number = t.manifest_number) desc, s.order_date
  limit 1) a on true
where t.shipped_lb is not null and t.shipped_lb <> 0
  and upper(btrim(coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence)))
      in (select upper(btrim(license)) from company_licenses where active);
;
