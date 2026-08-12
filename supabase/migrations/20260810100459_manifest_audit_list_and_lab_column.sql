-- Owner, 10 Aug 2026: "put lab manifests in own column", and "list every discrepancy in
-- manifest separately, all details for human to audit, ignore if discrepancy 1.00 or less -
-- we will enter journal entry for those."
--
-- ON THE DROP. CREATE OR REPLACE cannot rename a view column, and this summary changes from
-- one row per status to one row per month. Dependents were checked BEFORE writing this:
--   select ... from pg_depend join pg_rewrite ... where source.relname =
--   'v_manifest_discrepancy_summary'  ->  zero rows.
-- The view was created earlier in this same session and nothing reads it. Using the escape
-- hatch the guard itself prescribes, in the same transaction, rather than routing around it.
-- Never CASCADE - that form is what blanked every dashboard three times.
set local tg.allow_drop = 'yes';

drop view if exists v_manifest_discrepancy_summary;

create view v_manifest_discrepancy_summary as
select to_char(date_trunc('month', metrc_date), 'YYYY-MM')                      as month,
       count(*) filter (where destination_kind = 'SALE')                        as sale_manifests,
       count(*) filter (where status = 'RECONCILED')                            as reconciled,
       count(*) filter (where status like 'VALUE DIFFERS%')                     as value_differs,
       count(*) filter (where status = 'NO APEX ORDER for this invoice number') as no_apex_order,
       count(*) filter (where status = 'NO INVOICE NUMBER on the Metrc record') as no_invoice_number,
       count(*) filter (where status like 'BEFORE THE KEY%')                    as before_key_existed,
       /* NOT SALES — their own axis, counted and never netted into the money below */
       count(*) filter (where destination_kind = 'LABORATORY SAMPLE')           as lab_manifests,
       sum(package_tags) filter (where destination_kind = 'LABORATORY SAMPLE')  as lab_package_tags,
       count(*) filter (where destination_kind = 'INTERNAL TRANSFER')           as internal_manifests,
       count(*) filter (where destination_kind = 'TRANSPORTER')                 as transporter_manifests,
       count(*) filter (where destination_kind = 'UNKNOWN DESTINATION')         as unknown_destination,
       round(sum(metrc_declared) filter (where destination_kind = 'SALE'), 2)   as metrc_declared,
       round(sum(apex_value)     filter (where destination_kind = 'SALE'), 2)   as apex_value,
       round(sum(value_gap)      filter (where destination_kind = 'SALE'), 2)   as net_gap,
       round(100.0 * count(*) filter (where status = 'RECONCILED')
             / nullif(count(*) filter (where destination_kind = 'SALE'
                                         and metrc_date >= date '2025-01-30'), 0), 1) as pct_reconciled
from v_manifest_reconciliation
group by 1;

alter view v_manifest_discrepancy_summary set (security_invoker = on);

comment on view v_manifest_discrepancy_summary is
  'Monthly manifest reconciliation. Laboratory samples and internal transfers have their OWN '
  'COLUMNS (owner, 10 Aug 2026): neither is a sale and neither is a failure. The first outbound '
  'manifest this company ever filed, 2024-01-20, was a laboratory transfer - anchoring a sales '
  'reconciliation there would start it five months before trading began. pct_reconciled counts '
  'SALE manifests dated on or after 2025-01-30 only, the day Metrc first carried an invoice '
  'number; nothing earlier is matchable by construction.';

-- ── THE AUDIT LIST — one row per manifest a human has to settle ───────────────────
create or replace view v_manifest_discrepancy_audit as
select r.manifest_number,
       r.metrc_date,
       r.metrc_received,
       r.destination_licence,
       r.destination_facility,
       r.metrc_invoice_number,
       r.apex_invoices,
       r.apex_order_date,
       r.apex_delivery_date,
       r.date_gap_days,
       r.metrc_declared,
       r.apex_value,
       r.value_gap,
       case when r.value_gap > 0 then 'Apex sold MORE than Metrc declares'
            when r.value_gap < 0 then 'Metrc declares MORE than Apex sold' end as direction,
       r.money_lines,
       r.voided_lines,
       r.placeholder_lines,
       r.package_tags,
       r.apex_orders,
       r.status,
       case
         when r.apex_orders > 1        then 'Invoice number covers several Apex orders — sum them before comparing'
         when r.voided_lines > 0       then 'Metrc rows are voided on this manifest — confirm which were excluded'
         when r.placeholder_lines > 0  then 'Metrc carries placeholder prices under $1.00 on this manifest'
         when abs(r.date_gap_days) > 7 then 'Apex and Metrc dates are more than a week apart — likely a different shipment'
         when r.package_tags = 0       then 'No package lines in the transfer export — open the manifest PDF'
         else 'Compare the manifest PDF line by line against the Apex order'
       end as where_to_look
from v_manifest_reconciliation r
where r.destination_kind = 'SALE'
  and r.value_gap is not null
  and abs(r.value_gap) > (select value from conversion_factors
                          where key = 'apex_metrc_rounding_tolerance_usd');

alter view v_manifest_discrepancy_audit set (security_invoker = on);

comment on view v_manifest_discrepancy_audit is
  'Every manifest a person must audit: SALES only, and only where Apex and Metrc differ by MORE '
  'than the owner-set tolerance. Differences of $1.00 or less are deliberately absent - owner '
  'ruling 10 Aug 2026, those are rounding and clear by journal entry rather than investigation. '
  'Every field needed to settle a row is ON the row, including where_to_look, so auditing one '
  'does not require writing a query. A Metrc figure is a DECLARED TRANSFER PRICE, not a sale '
  'price, and the two legitimately differ.';;
