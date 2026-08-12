-- THE OWNER'S METHOD, APPLIED TO EVERY CONFLICT. Ruling of 7 Aug 2026:
--   "You check ours first. You caught a match - but then you confirm with the COA,
--    since there is doubt."
--
-- Three sources, ranked by independence:
--   1. PLATFORM   - ItemFromFacilityLicenseNumber. Names who defined the ITEM, and
--                   flips to us on any repack under a new item name. Weakest.
--   2. LINEAGE    - f_material_origin walks SourcePackageLabels to its roots and
--                   reports where the material entered our custody. Stronger, but
--                   still Metrc, so it shares one origin with (1) and cannot
--                   independently disconfirm it.
--   3. CERTIFICATE- coa_extract.client_license, read from the laboratory's own
--                   report, resolved through the lineage because a certificate
--                   belongs to the package the lab SAMPLED and everything made from
--                   it carries the same certified facts. THE ONLY INDEPENDENT
--                   SOURCE. It wins.
--
-- KNOWN LIMIT, STATED IN THE VIEW ITSELF: the certificate client is whoever
-- SUBMITTED the sample. That equals the cultivator when the cultivator submitted it
-- - as with the Greater Goods packages, tested on their own tags and shipped to us
-- afterwards. It does NOT when we re-tested material we had bought. So a certificate
-- naming US on material the lineage says is theirs is NOT proof we grew it, and is
-- reported as INCONCLUSIVE rather than agreement.
--
-- UNDO: drop view v_ownership_verdict;

create or replace view public.v_ownership_verdict as
with conflicted as (
  select p.tag, p.item_name, p.uom, p.quantity, p.source_state, p.lab_testing_state,
         p.raw->>'ItemFromFacilityLicenseNumber' as platform_license,
         p.raw->>'ItemFromFacilityName'          as platform_name,
         o.origin                                as lineage
  from (select distinct on (tag) tag, item_name, uom, quantity, source_state,
               lab_testing_state, raw
        from metrc_packages order by tag, license) p
  cross join lateral (select f_material_origin(p.tag) as origin) o
  where p.source_state = any (array['active','onhold'])
    and f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')
    and (o.origin->>'any_outside')::boolean is true
),
certed as (
  select c.*, r.cert_license, r.cert_client, r.found_at_depth, r.certificate_on_package
  from conflicted c
  left join v_certificate_resolved r on r.package_tag = c.tag
)
select tag                                            as package_tag,
       left(item_name, 50)                            as item_name,
       source_state,
       lab_testing_state,
       case when f_is_weight(uom) then round(f_to_pounds(quantity, uom), 2) end as pounds,
       platform_license                               as platform_says,
       lineage->'origin_names'                        as lineage_says,
       lineage->'origin_licences'                     as lineage_licences,
       lineage->'inbound_manifests'                   as inbound_manifests,
       cert_client                                    as certificate_says,
       cert_license                                   as certificate_license,
       case when found_at_depth is null then null
            when found_at_depth = 0 then 'direct'
            else 'inherited via ' || found_at_depth end as certificate_link,
       certificate_on_package,
       case
         when cert_license is null and cert_client is null
           then 'UNPROVEN - no certificate in the lineage. Ownership doubt raised, not settled.'
         when cert_license is not null
          and position(platform_license in cert_license) = 0
           then 'CONFIRMED NOT OURS - the laboratory names ' || coalesce(cert_client,'another licensee')
                || '. The certificate is independent and it wins.'
         when cert_license is not null
          and position(platform_license in cert_license) > 0
           then 'INCONCLUSIVE - the certificate names us, but the lineage says the '
                || 'material came from outside. Consistent with us paying for a '
                || 'retest after buying it. NOT proof we grew it.'
         else 'NAME ONLY - the certificate names ' || coalesce(cert_client,'?')
              || ' but prints no licence (MCR Labs does not). Judge on the name.'
       end                                            as verdict,
       'THE ISSUE: this package is counted as ours. Ownership drives yield, cost, '
       'loss and on-hand, and every one of those is wrong if this is somebody '
       'else''s material.'                            as what_is_wrong
from certed;

comment on view public.v_ownership_verdict is
  'Every active package the platform calls ours whose material traces outside, '
  'judged against the laboratory certificate - the owner''s method, applied to all '
  'of them. CONFIRMED NOT OURS means the certificate contradicts us and wins. '
  'INCONCLUSIVE means the certificate names us but the lineage does not, which is '
  'what a retest of bought-in material looks like and is NOT proof of ownership. '
  'UNPROVEN means no certificate exists in the lineage - doubt raised, not settled, '
  'and nothing may be posted on it.';;
