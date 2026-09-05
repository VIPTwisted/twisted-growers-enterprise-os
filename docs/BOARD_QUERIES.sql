-- Re-derive every board line against production.
-- One block per ticket id. Read-only.

-- XQ1 / XQ2 / XQ3 / XQ4
-- Expect: moisture 205, never submitted 122, failed 257, open 13 (as-of 2026-09-05).
select queue, items, needs_action_now, pounds_involved, metrc_as_of
from v_xq_summary
order by ord;

-- DEST-MC
-- Expect: 3773 rows, 0 destroyed_on, 3772 with source_row Destroyed Date.
select count(*)::int as n,
       count(*) filter (where destroyed_on is not null)::int as ledger_dated,
       count(*) filter (where nullif(btrim(source_row->>'Destroyed Date'), '') is not null)::int as source_dated
from metrc_rpt_plants_destroyed
where licence = 'MC281714';

-- DEST-MC the one undated row — it is a header ingested as data, not a plant.
-- Expect: plant_tag = 'Destroyed Note'
select plant_tag, strain, location, phase, source_row
from metrc_rpt_plants_destroyed
where licence = 'MC281714'
  and nullif(btrim(source_row->>'Destroyed Date'), '') is null;

-- APEX-303 order grain (this is the 1710 / 1800)
-- total_dollars = apex payload total_raw / 100
-- apex_subtotal_usd = apex payload subtotal_raw / 100
-- money-reconciles compares SUBTOTAL to Metrc declared_buyer, not total
-- Expect: 1710.00, 1800.00, metrc_declared_buyer_usd 1800.00, foreign_manifests 13
select invoice_number,
       total_dollars,
       apex_subtotal_usd,
       metrc_declared_buyer_usd,
       metrc_declared_any_buyer_usd,
       foreign_manifests,
       buyer_confirmed_manifests,
       link_status
from v_apex_order_metrc_link
where invoice_number = 'Twiste-303';

-- APEX-303 independent of the view — apex_raw payload
-- Expect: total_raw 171000, subtotal_raw 180000
select payload->>'invoice_number' as invoice_number,
       payload->>'total_raw' as total_raw,
       payload->>'subtotal_raw' as subtotal_raw,
       (select value from conversion_factors where key = 'apex_money_raw_minor_units') as divisor,
       round((payload->>'total_raw')::numeric / 100, 2) as total_dollars,
       round((payload->>'subtotal_raw')::numeric / 100, 2) as subtotal_dollars,
       fetched_at
from apex_raw
where entity = 'shipping-orders'
  and payload->>'invoice_number' = 'Twiste-303'
order by fetched_at desc, id desc
limit 1;

-- APEX-303 Metrc side (watcher already MATCHED this)
-- Expect: manifest 0002892412, destination MR282256, declared 1800.00
select manifest_number,
       destination_licence,
       destination_facility,
       metrc_invoice_number,
       metrc_declared,
       apex_value,
       apex_invoices,
       status,
       buyer_match
from v_manifest_reconciliation
where apex_invoices = 'Twiste-303'
   or (metrc_invoice_number = '303' and destination_licence = 'MR282256');

-- APEX-BOOK / APEX-MATCH / APEX-VD
-- Expect partition sum 1860; MATCHED 680; VALUE DIFFERS 198
select link_status, count(*)::int as n
from v_apex_order_metrc_link
group by 1
order by n desc;

select count(*)::int as book from v_apex_order_metrc_link;

-- PKGINV headers — do not bind. 33 not 34.
-- Expect: headers 33, live 2, undone 31
select count(*)::int as headers,
       count(*) filter (where undone_at is null)::int as live,
       count(*) filter (where undone_at is not null)::int as undone
from metrc_report_imports
where report_type = 'packages_inventory';

-- PKGINV the two live headers
-- Expect:
--   9cf5143d MP281909 446 stored / 446 stated as-of 2026-08-06
--   18807117 MC281714 62 stored / 62 stated as-of 2026-08-06
-- stated_total is a ROW COUNT, not pounds. Do not total quantity.
select id, license, row_count, stated_total, as_of_date, undone_at, left(count_check, 160) as count_check
from metrc_report_imports
where report_type = 'packages_inventory'
  and undone_at is null
order by license;

-- PKGINV stored rows owned by those two headers
-- Expect: 508 = 62 + 446, mixed uom
select import_id, licence, as_of_date, count(*)::int as n
from metrc_rpt_packages_inventory
group by 1, 2, 3;

select licence, uom, count(*)::int as n, sum(quantity) as qty_do_not_cross_uom
from metrc_rpt_packages_inventory
group by 1, 2
order by 1, 2;

-- WASTE-MC keys — do not total waste_qty
select count(*)::int as n from metrc_rpt_plant_waste;

-- PR120 leftover grok policies
-- Expect: leftover 0, public 859
select count(*)::int as leftover_grok
from pg_policies
where schemaname = 'public'
  and policyname in ('grok_access_owner_ruling_4sep2026', 'grok_writer_owner_ruling_4sep2026');

select count(*)::int as public_policies
from pg_policies
where schemaname = 'public';
