-- The single most important forensic field on a certificate was being discarded.
-- coa_extract held 983 parsed COAs across 27 columns - THC, terpenes, microbiology,
-- pesticides, solvents, water activity - and NOT ONE recorded who grew or made the
-- material. The answer to "whose is it?" sat unread in coa/2267739.pdf from 6 Aug
-- until it was opened by hand on 7 Aug.
--
-- On a Green Analytics Massachusetts report the header reads:
--     Client Info
--     Greater Goods, LLC
--     445 Myles Standish Blvd. Taunton, MA 02780
--     License: MB282344
--     Metrc Manifest: 3086180
-- client_license is the CULTIVATOR, MANUFACTURER OR PROCESSOR OF RECORD and
-- outranks ItemFromFacilityLicenseNumber on every ownership question.
-- UNDO: alter table coa_extract drop column client_name, drop column client_license, ...

alter table coa_extract
  add column if not exists client_name        text,
  add column if not exists client_license     text,
  add column if not exists client_address     text,
  add column if not exists lab_report_id      text,
  add column if not exists metrc_batch_id     text,
  add column if not exists metrc_sample_id    text,
  add column if not exists metrc_source_id    text,
  add column if not exists manifest_on_coa    text,
  add column if not exists client_parsed_at   timestamptz;

comment on column coa_extract.client_license is
  'THE CULTIVATOR / MANUFACTURER / PROCESSOR OF RECORD, read from the "Client Info" '
  'block of the certificate. This is the only INDEPENDENT source for who owned the '
  'material - every Metrc field shares one origin and cannot disconfirm another. '
  'Outranks ItemFromFacilityLicenseNumber on any ownership question.';
comment on column coa_extract.metrc_batch_id is
  'METRC Batch ID on the certificate - the HARVEST. Cross-check against SourceHarvestNames.';
comment on column coa_extract.metrc_source_id is
  'METRC Source ID on the certificate - the package the sample was cut from.';

create index if not exists coa_extract_client_license_idx on coa_extract (client_license);
create index if not exists coa_extract_package_tag_idx    on coa_extract (package_tag);;
