-- Agent G, 10 Aug 2026. The reconciliation kept hitting statement_timeout because every query
-- re-derived the normalised invoice number across 12,282 wholesale rows and then scanned 5,280
-- manifests per candidate order with no index on the licence. Indexes only - no column, no
-- constraint, no semantic change. Non-destructive and reversible with DROP INDEX.
--
-- The expression index has to match the expression used in the views EXACTLY or the planner
-- will not use it, so both are written the same way: regexp_replace(x, '\D', '', 'g').

create index if not exists metrc_rpt_wholesale_invoice_digits_idx
  on metrc_rpt_wholesale ((regexp_replace(invoice_number, '\D', '', 'g')))
  where invoice_number is not null;

create index if not exists metrc_rpt_transfer_manifests_dest_date_idx
  on metrc_rpt_transfer_manifests (destination_licence, created_on)
  where direction = 'outbound';

create index if not exists metrc_rpt_package_transfers_manifest_idx
  on metrc_rpt_package_transfers (manifest_number);

create index if not exists apex_raw_entity_idx on apex_raw (entity);

analyze metrc_rpt_wholesale;
analyze metrc_rpt_transfer_manifests;
analyze metrc_rpt_package_transfers;
analyze apex_raw;;
