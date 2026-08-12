-- A COUNTABLE ITEM STILL HAS A QUANTITY. Owner, 7 Aug 2026:
--   "this countable is issue" / "do not allow that, agents should flag that".
--
-- THE DEFECT. Views here reported quantity as
--     case when f_is_weight(uom) then round(f_to_pounds(quantity, uom), 2) end
-- which is right to refuse to invent a weight - but it NULLS the row entirely, so a
-- countable item shows as nothing. 34 packages holding 5,163 ZEN gummies appeared
-- in the ownership verdict as "countable" with no number beside them.
--
-- This is the MIRROR of the trap the rules already carry. "Countable items have no
-- weight, never assume grams" stops you inventing a figure. It does NOT license you
-- to report no figure. Weight-based and count-based are different UNITS, not
-- different levels of existence, and any total that silently drops one is wrong.
--
-- Columns are APPENDED - CREATE OR REPLACE cannot insert one mid-view.
-- UNDO: previous definition in v_ownership_verdict_all_conflicts_against_the_certificate.

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
       'else''s material.'                            as what_is_wrong,
       -- APPENDED. pounds above stays null for a countable item - correct, no
       -- invented weight - and these carry what was being thrown away.
       case when not f_is_weight(uom) then quantity end as units,
       uom                                              as unit_of_measure,
       case when f_is_weight(uom)
              then round(f_to_pounds(quantity, uom), 2)::text || ' lb'
            else trim(to_char(quantity, 'FM999G999G990D99')) || ' ' || uom
       end                                              as how_much
from certed;

comment on view public.v_ownership_verdict is
  'Every active package the platform calls ours whose material traces outside, '
  'judged against the laboratory certificate. REPORT how_much, NEVER pounds alone: '
  'pounds is null for countable items and summing it silently drops them - 34 '
  'packages holding 5,163 units were reported as "countable" with no number until '
  '7 Aug 2026. CONFIRMED NOT OURS means the certificate contradicts us and wins. '
  'INCONCLUSIVE means the certificate names us but the lineage does not, which is '
  'what a retest of bought-in material looks like and is NOT proof of ownership.';;
