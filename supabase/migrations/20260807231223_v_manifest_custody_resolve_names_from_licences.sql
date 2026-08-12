-- Resolve a licence number to a company name from data we already hold, rather
-- than from PDF layout.
--
-- WHY: the edge function uses unpdf, which does NOT preserve column layout the way
-- pdftotext -layout does. Licences parse perfectly because they are matched on a
-- PATTERN (MC/MP/MB/MR/MT/MX/IL/RMD). Names came back null because they depend on
-- reading the second column of a three-column line.
--
-- That is fine, and arguably better: the licence is the authoritative identifier
-- and a name derived from our own transfer and package history is more reliable
-- than one scraped out of a PDF. Every counterparty we have ever traded with
-- already appears in metrc_transfers or metrc_packages with both licence and name.
--
-- UNDO: drop view v_manifest_custody; drop view v_licence_directory;

create or replace view public.v_licence_directory as
select licence, name, sources, seen
from (
  select licence, name, count(*) seen, string_agg(distinct src, ', ') sources,
         row_number() over (partition by licence order by count(*) desc) rn
  from (
    select raw->>'ShipperFacilityLicenseNumber' licence,
           raw->>'ShipperFacilityName' name, 'transfer shipper' src
      from metrc_transfers where nullif(raw->>'ShipperFacilityLicenseNumber','') is not null
    union all
    select raw->>'RecipientFacilityLicenseNumber', raw->>'RecipientFacilityName', 'transfer recipient'
      from metrc_transfers where nullif(raw->>'RecipientFacilityLicenseNumber','') is not null
    union all
    select raw->>'ItemFromFacilityLicenseNumber', raw->>'ItemFromFacilityName', 'package item origin'
      from metrc_packages where nullif(raw->>'ItemFromFacilityLicenseNumber','') is not null
    union all
    select raw->>'ReceivedFromFacilityLicenseNumber', raw->>'ReceivedFromFacilityName', 'package received from'
      from metrc_packages where nullif(raw->>'ReceivedFromFacilityLicenseNumber','') is not null
    union all
    select client_license, client_name, 'certificate client'
      from coa_extract where client_license is not null and client_name is not null
  ) z
  where name is not null and name <> ''
  group by licence, name
) d
where rn = 1;

comment on view public.v_licence_directory is
  'Every Massachusetts licence we have traded with, mapped to the name we see most '
  'often for it, drawn from transfers, packages and certificates. Use this to name a '
  'licence rather than scraping a name out of a PDF.';

create or replace view public.v_manifest_custody as
select m.manifest_number,
       m.date_created,
       t.direction,
       coalesce(m.origin_name, od.name)        as shipped_by,
       m.origin_license,
       coalesce(dd.name, m.destination_name)   as delivered_to,
       m.destination_license,
       case
         when m.destination_license is null              then 'UNKNOWN'
         when m.destination_license like 'IL%'           then 'LABORATORY'
         when m.destination_license like 'MX%'           then 'TRANSPORTER'
         when m.destination_license like 'MT%'           then 'STORAGE / TRANSPORT - never a sale'
         when m.destination_license like 'MR%'
           or m.destination_license like 'RMD%'          then 'RETAIL'
         else 'LICENSEE'
       end                                     as destination_kind,
       coalesce(m.transporter_name, td.name)   as carried_by,
       m.transporter_license,
       m.is_lab_run,
       m.departure, m.arrival,
       (select count(*) from metrc_rpt_package_transfers p
         where p.manifest_number = m.manifest_number) as packages
from manifest_extract m
left join metrc_transfers t     on t.manifest_number = m.manifest_number
left join v_licence_directory od on od.licence = m.origin_license
left join v_licence_directory dd on dd.licence = m.destination_license
left join v_licence_directory td on td.licence = m.transporter_license;

comment on view public.v_manifest_custody is
  'Chain of custody outside the facility, read from the manifest PDF and named from '
  'our own licence directory. This is the half of seed-to-sale the platform could '
  'not see: metrc_transfers carries a NULL recipient on all 2,550 outgoing records '
  'because Metrc returns it on the deliveries endpoint, which the sync never called. '
  'destination_kind flags a laboratory or an MT transporter destination - the latter '
  'is NEVER a sale, a rule already broken once for $901,430.';;
