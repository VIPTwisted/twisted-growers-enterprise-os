-- Agent: M — product_inventory carried 23 of the sheet's columns and dropped the rest.
-- Owner ruling build_to_the_sophistication_of_the_sheets: if a column exists in the sheet,
-- it exists in the model. Additive only - no existing column renamed, reordered or retyped.

alter table product_inventory
  -- columns the sheet has and the model did not
  add column if not exists infusion_type        text,
  add column if not exists location             text,
  add column if not exists coa_link             text,
  add column if not exists inventory_check      text,
  add column if not exists notes                text,
  add column if not exists days_to_expiration   integer,
  add column if not exists expiry_flag          text,
  add column if not exists threshold_units      numeric,
  add column if not exists low_stock_flag       text,
  add column if not exists total_units_filled   numeric,
  add column if not exists total_units_packaged numeric,
  -- THC and THCA are different analytes. The tabs report one or the other.
  add column if not exists thc_pct              numeric,
  add column if not exists cannabinoid_reported text,
  -- "Not Tested" is a status, not a number
  add column if not exists terpene_status       text,
  -- size arrives as "1.0 g", "1g", "0.5g ", "3.5" - keep the number and the unit
  add column if not exists size_value           numeric,
  add column if not exists size_unit            text,
  -- typed sibling of the existing text projected_avail
  add column if not exists projected_avail_date date,
  -- "IN CURE" sits where a tag belongs on Production rows
  add column if not exists final_tag_note       text,
  -- business identity, distinct from the (source_sheet, source_row) row identity
  add column if not exists business_key         text,
  add column if not exists business_key_basis   text,
  -- provenance
  add column if not exists sheet_key            text,
  add column if not exists source_file_id       text,
  add column if not exists header_fingerprint   text,
  add column if not exists import_run_id        uuid,
  add column if not exists sheet_modified_at    timestamptz,
  add column if not exists as_of                date;

comment on table product_inventory is
'FINISHED GOODS ON HAND, mirrored read-only from the owner''s "Manufacturing Product Inventory" workbook (sheet_source.sheet_key = manufacturing_product_inventory). Owner: "THIS IS INVENTORY ON HAND FINISHED GOODS THIS MUST MUST MUST BE ON OUR COMMAND CENTER FOR COO AND CEO." The workbook is a SYSTEM OF RECORD WE READ - the platform never writes a cell back (owner ruling spreadsheets_are_view_only_forever). One row per spreadsheet row per tab; raw holds that row verbatim beside the typed columns so nothing is ever only in the typed form. Row identity for idempotent re-import is (source_sheet, source_row) per duplicate_key; business identity is business_key, which is the Final Product Metrc tag where there is one and the Production Batch # where there is not.';

comment on column product_inventory.business_key is
'Final Product Metrc tag where present, Production Batch # where not. business_key_basis says which. NOT the idempotency key - see duplicate_key for that.';
comment on column product_inventory.cannabinoid_reported is
'Which analyte the tab reported: THC or THCA. The tabs differ and the two are not the same measurement, so they are stored in separate columns rather than pooled.';
comment on column product_inventory.terpene_status is
'Holds "Not Tested" and similar sentinels that appear where a terpene percentage belongs. The number column stays NULL rather than being coerced to zero.';
comment on column product_inventory.final_tag_note is
'Non-tag text found in the Final Product Metrc Tag column - "IN CURE" on Production rows. Kept verbatim so the row is not rejected and the value is not lost.';
comment on column product_inventory.coa_link is
'Link To COA, recorded VERBATIM. These are bit.ly redirects, not durable document references - never resolved or rewritten by the importer.';
comment on column product_inventory.as_of is
'The sheet''s modified date at the moment we read it. This mirror is only ever as fresh as this.';;
