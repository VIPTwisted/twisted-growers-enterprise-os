-- PARSER BUG, CORRECTED AT THE READING LAYER. Found 7 Aug 2026 by the first check
-- ever run against the parsed manifests - comparing them to metrc_transfers.
--
-- parse-documents assigns origin_license = "the first licence that is OURS", which
-- assumes WE ARE ALWAYS THE SENDER. On an INCOMING manifest we are the RECIPIENT,
-- so origin and destination come out inverted. All 62 incoming manifests parsed so
-- far are wrong that way. All 430 outgoing agree with Metrc exactly.
--
-- The proper fix is POSITIONAL - the Originating Entity block precedes the
-- Destination block, so the first licence is the origin and the second the
-- destination, whoever we are. That goes into the next function deploy. This view
-- is what every consumer reads, and metrc_transfers.direction gives the orientation
-- reliably, so it is corrected here rather than serving inverted custody data.
--
-- THE SHAPE OF THE ERROR IS THE LESSON: assuming our own position instead of
-- reading the document. It produced confident, plausible, exactly-backwards
-- answers, and surfaced only because the output was checked against an independent
-- source. Column names are kept (origin_license) because CREATE OR REPLACE cannot
-- rename; it now holds the SHIPPER whichever direction the manifest went.
-- UNDO: previous definition in v_manifest_custody_resolve_names_from_licences.

create or replace view public.v_manifest_custody as
with oriented as (
  select m.manifest_number, m.date_created, m.departure, m.arrival, m.is_lab_run,
         t.direction,
         case when t.direction = 'incoming' then m.destination_license else m.origin_license end as ship_lic,
         case when t.direction = 'incoming' then m.origin_license      else m.destination_license end as dest_lic,
         case when t.direction = 'incoming' then m.destination_name    else m.origin_name end as ship_nm,
         case when t.direction = 'incoming' then m.origin_name         else m.destination_name end as dest_nm,
         m.transporter_name, m.transporter_license,
         t.raw->>'ShipperFacilityLicenseNumber' as metrc_shipper
  from manifest_extract m
  left join metrc_transfers t on t.manifest_number = m.manifest_number
)
select o.manifest_number,
       o.date_created,
       o.direction,
       coalesce(sd.name, o.ship_nm)          as shipped_by,
       o.ship_lic                            as origin_license,   -- the SHIPPER, either direction
       coalesce(dd.name, o.dest_nm)          as delivered_to,
       o.dest_lic                            as destination_license,
       case
         when o.dest_lic is null                              then 'UNKNOWN'
         when o.dest_lic like 'IL%'                           then 'LABORATORY'
         when o.dest_lic like 'MX%'                           then 'TRANSPORTER'
         when o.dest_lic like 'MT%'                           then 'STORAGE / TRANSPORT - never a sale'
         when o.dest_lic like 'MR%' or o.dest_lic like 'RMD%' then 'RETAIL'
         else 'LICENSEE'
       end                                   as destination_kind,
       coalesce(o.transporter_name, td.name) as carried_by,
       o.transporter_license,
       o.is_lab_run,
       o.departure, o.arrival,
       (select count(*) from metrc_rpt_package_transfers p
         where p.manifest_number = o.manifest_number) as packages,
       (o.metrc_shipper is not null and o.ship_lic is not null
        and o.metrc_shipper <> o.ship_lic)   as shipper_disagrees_with_metrc
from oriented o
left join v_licence_directory sd on sd.licence = o.ship_lic
left join v_licence_directory dd on dd.licence = o.dest_lic
left join v_licence_directory td on td.licence = o.transporter_license;

comment on view public.v_manifest_custody is
  'Chain of custody outside the facility, read from the manifest PDF and named from '
  'our own licence directory. Corrects the parser''s incoming/outgoing inversion. '
  'origin_license holds the SHIPPER in either direction. '
  'shipper_disagrees_with_metrc is the standing two-way check - it must be false on '
  'every row, and any true is a REAL discrepancy rather than an artefact.';;
