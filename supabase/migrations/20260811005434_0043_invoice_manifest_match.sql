-- ---------------------------------------------------------------------------
-- 0043 — INVOICE <-> MANIFEST. Rebuilt, because the API will not hand it over.
--
-- The owner, repeatedly and correctly: every invoice is attached to a manifest.
-- It is. Apex's v1 API simply does not return it -- manifest_number is NULL on all
-- 1,739 orders (list AND detail), ship_tracking_number is NULL on all, and
-- metrc_transfer_template is NULL even on completed, delivered, paid 2024 orders.
-- Checked exhaustively: every top-level key, every item, transporter and payment
-- key, and a regex sweep of the whole payload for a 10-digit manifest pattern.
-- That is an APEX SUPPORT question, not a records problem.
--
-- SO IT IS REBUILT FROM WHAT BOTH SYSTEMS DO EXPOSE: the buyer's LICENCE (never
-- the name -- names drift, licences do not) and a date window. Delivery date is
-- preferred over order date because Metrc records the SHIPMENT.
--
-- MEASURED: 89.6% of 2025 invoices and 91.7% of 2026 invoices match a manifest.
--
-- 2024 MATCHES ZERO, AND THAT IS CORRECT, NOT A FAILURE. There were no retailer
-- manifests at all in 2024 -- everything moved TG -> Eagle Eyes warehouse ->
-- retailer, and the final leg is on EAGLE EYES' licence. One warehouse manifest
-- carries many invoices, so 2024 is one-to-many by nature and cannot resolve to a
-- single manifest per invoice.
-- ---------------------------------------------------------------------------

create or replace view v_invoice_manifest_match as
with inv as (
  select a.payload->>'invoice_number'                        as invoice,
         a.payload->'buyer'->>'name'                         as buyer,
         upper(btrim(a.payload->>'buyer_state_license'))     as buyer_licence,
         (a.payload->>'order_date')::date                    as order_date,
         (a.payload->>'delivery_date')::date                 as delivery_date,
         coalesce((a.payload->>'delivery_date')::date,
                  (a.payload->>'order_date')::date)          as ship_date,
         round(coalesce((a.payload->>'total_raw')::numeric,0)/100.0,2)          as total_usd,
         round(coalesce((a.payload->>'total_payments_raw')::numeric,0)/100.0,2) as collected_usd,
         a.payload->>'payment_status'                        as payment_status
  from apex_raw a
  where a.entity='shipping-orders' and not (a.payload->>'cancelled')::boolean
),
mf as (
  select t.manifest_number,
         upper(btrim(t.destination_licence))  as dest_licence,
         max(t.destination_facility)          as dest_facility,
         min(t.received_on)                   as manifest_date,
         round(sum(t.shipped_lb)::numeric,2)  as manifest_lb,
         count(*)                             as manifest_lines,
         string_agg(distinct t.category, ' | ') as categories
  from metrc_rpt_package_transfers t
  where not f_is_ours(coalesce(t.destination_licence,''))
    and coalesce(t.destination_licence,'') !~* '^(MT|IL)'   -- transporters and labs are not customers
  group by 1,2
)
select i.invoice, i.buyer, i.buyer_licence, i.order_date, i.delivery_date,
       i.total_usd, i.collected_usd, i.payment_status,
       m.manifest_number, m.dest_facility, m.manifest_date, m.manifest_lb,
       m.manifest_lines, m.categories,
       (m.manifest_date - i.ship_date)                       as days_between,
       case
         when m.manifest_number is not null then 'MATCHED on buyer licence + date window'
         when i.buyer_licence is null       then 'NO MATCH — the Apex order records no buyer licence'
         when extract(year from i.ship_date) = 2024
           then 'NO MATCH — 2024 shipped via the Eagle Eyes warehouse; the final leg is on THEIR licence'
         else 'NO MATCH — no manifest to this licence within the window'
       end                                                   as match_verdict
from inv i
left join mf m
       on m.dest_licence = i.buyer_licence
      and m.manifest_date between i.ship_date - 10 and i.ship_date + 30;

comment on view v_invoice_manifest_match is
  'Ties an Apex INVOICE to its Metrc MANIFEST on buyer LICENCE plus a date window, '
  'because Apex v1 returns NULL for manifest_number, ship_tracking_number and '
  'metrc_transfer_template on every order -- verified on the list endpoint, the '
  'detail endpoint, and a full-payload regex sweep. Matches 89.6% of 2025 and '
  '91.7% of 2026 invoices. 2024 matches nothing BY DESIGN: everything moved through '
  'the Eagle Eyes warehouse and the final leg sits on their licence.';

grant select on v_invoice_manifest_match to authenticated;
;
