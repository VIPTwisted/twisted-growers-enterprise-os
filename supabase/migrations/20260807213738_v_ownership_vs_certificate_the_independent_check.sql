-- THE INDEPENDENT CHECK. Owner ruling, 7 Aug 2026:
--   "You check ours first. You caught a match - but then you confirm with the
--    COA, since there is doubt."
--
-- Every Metrc field shares one origin and cannot disconfirm another. The
-- certificate comes from the testing laboratory and is the ONLY independent
-- statement of who grew or made the material. 983 certificates were on disk;
-- 972 now carry client_license, read from five different lab layouts:
--   Green Analytics 'Client Info' · Safetiva 'CULTIVATOR/MANUFACTURER INFO'
--   MCR-style name-above-'License #:' · Analytics Labs 'Client'/'Lic. #'
--   Kaycha name-above-'License # :'
-- A Massachusetts LAB licence is always IL######, so any MC/MP/MB/MR/MT/RMD
-- licence in the header belongs to the client. That is the anchor.
--
-- 11 certificates carry no client licence at all and are reported as UNPROVEN,
-- never as agreement. Absence is not confirmation.

create or replace view public.v_ownership_vs_certificate as
with cert as (
  select e.package_tag,
         max(e.client_license) as cert_license,
         max(e.client_name)    as cert_client,
         max(e.lab_report_id)  as cert_report,
         count(*)              as certificates
  from coa_extract e
  where e.package_tag is not null
  group by e.package_tag
),
pkg as (
  select distinct on (p.tag)
         p.tag, p.item_name, p.license, p.uom, p.quantity, p.source_state,
         p.lab_testing_state,
         p.raw->>'ItemFromFacilityLicenseNumber' as platform_license,
         p.raw->>'ItemFromFacilityName'          as platform_name,
         p.raw->>'SourcePackageCount'            as source_packages,
         p.raw->>'ReceivedFromManifestNumber'    as inbound_manifest
  from metrc_packages p
  order by p.tag, p.license          -- metrc_packages is NOT unique on tag
)
select k.tag                       as package_tag,
       left(k.item_name, 55)       as item_name,
       k.source_state,
       k.lab_testing_state,
       case when f_is_weight(k.uom) then round(f_to_pounds(k.quantity, k.uom), 2) end as pounds,
       k.platform_license,
       k.platform_name,
       c.cert_license,
       c.cert_client,
       c.cert_report,
       c.certificates,
       k.source_packages,
       k.inbound_manifest,
       case
         when c.package_tag is null              then 'NO CERTIFICATE'
         when c.cert_license is null             then 'UNPROVEN - certificate carries no client licence'
         when position(k.platform_license in c.cert_license) > 0
                                                 then 'AGREES'
         else 'CONFLICT'
       end as verdict,
       case
         when c.cert_license is not null and position(k.platform_license in c.cert_license) = 0
         then 'THE ISSUE: the platform calls this ' || k.platform_license ||
              ' but the laboratory certificate names ' || coalesce(c.cert_client,'?') ||
              ' (' || c.cert_license || ') as the client. The certificate is the ' ||
              'independent source and it wins.'
       end as what_is_wrong
from pkg k
left join cert c on c.package_tag = k.tag;

comment on view public.v_ownership_vs_certificate is
  'Three-way ownership check: what the platform says (ItemFromFacilityLicenseNumber), '
  'what the certificate says (coa_extract.client_license, read from the lab report), '
  'and whether they agree. CONFLICT means the certificate contradicts the platform - '
  'the certificate wins, it is the only independent source. NO CERTIFICATE and '
  'UNPROVEN are NOT agreement; nothing may be posted on either.';;
