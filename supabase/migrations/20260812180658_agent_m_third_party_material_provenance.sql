alter table third_party_material
  add column if not exists company_name    text,
  add column if not exists licence         text,
  add column if not exists tag_is_full     boolean,
  add column if not exists source_key      text,
  add column if not exists import_run_id   uuid,
  add column if not exists as_of           date,
  add column if not exists raw             jsonb,
  add column if not exists still_in_sheet  boolean not null default true;

comment on table third_party_material is
'Third-party material physically held on our site, mirrored read-only from the "3rd Party Material" tab of the Manufacturing Product Inventory workbook. This is NOT ours - owner ruling on rights_obligations: it must never be counted as our inventory. We do not mirror other facilities'' packages, so these tags will not resolve in metrc_packages and that is correct, not a gap.';

comment on column third_party_material.metrc_tag is
'AS RECORDED IN THE SHEET. Measured 12 Aug 2026: every value is a SHORT NUMERIC FRAGMENT (e.g. 1479, 64709), not a 24-character Metrc tag. See tag_is_full. These cannot be joined to Metrc as they stand.';
comment on column third_party_material.tag_is_full is
'TRUE only when metrc_tag is a full 24-character Metrc tag. FALSE means the sheet holds a fragment and the row cannot be resolved to a Metrc package without a person supplying the rest.';
comment on column third_party_material.licence is
'The MA licence parsed off the end of the Company cell by SHAPE (MC/MP/MX/IL followed by six digits), not by position. company_name holds the remainder.';;
