-- THE CERTIFICATE FIELD CAN HOLD MORE THAN ONE LICENCE, AND I TREATED IT AS ONE.
--
-- 621 of 972 parsed certificates carry client_license = 'MC281714, MP281909' —
-- both of our licences in a single field, because that is how the laboratory
-- prints it for a company holding two. f_is_ours() takes ONE licence and
-- correctly returns false for that combined string.
--
-- The consequence was a wrong headline I gave the owner: "887 of 972
-- certificates name someone else." The true figure is 266. 706 of them are ours.
-- I built a three-source ownership check whose external source was misreading
-- two thirds of its own evidence, and it presented as a clean result.
--
-- The tell was visible and I nearly walked past it: the display column showed
-- client_name 'Twisted Growers' on rows my own verdict counted as not ours. A
-- name and a licence disagreeing inside one document is a contradiction, and
-- the right response was to stop, not to correct 27 packages on it.
--
-- Now: split the field on commas and ask whether ANY licence on the certificate
-- is ours. Also record the parse quality separately — a certificate naming us by
-- name but not by any recognisable licence is a different problem from one
-- naming another company.
create or replace view v_ownership_evidence as
with pkg as (
  select p.tag, p.item_name, p.license, p.lab_testing_state,
         f_to_pounds(p.quantity, p.uom)                            as lb,
         p.quantity,
         f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')        as a_platform_ours,
         p.raw->>'ItemFromFacilityLicenseNumber'                   as a_licence,
         f_package_is_ours(p.tag)                                  as b_lineage,
         f_material_origin(p.tag)                                  as b_detail
  from metrc_packages p
),
withcoa as (
  select pkg.*,
         c.client_license, c.client_name, c.report_date,
         case
           when c.client_license is null or btrim(c.client_license) = '' then null
           -- ANY licence on the certificate being ours makes it ours. The field
           -- is free text from a PDF and holds one or several.
           else exists (
             select 1 from unnest(string_to_array(c.client_license, ',')) as lic
             where f_is_ours(btrim(lic))
           )
         end                                                       as c_ours,
         (select count(*) from unnest(string_to_array(coalesce(c.client_license,''), ',')) l
           where btrim(l) <> '')                                   as c_licence_count
  from pkg
  left join lateral (
    select ce.client_license, ce.client_name, ce.report_date
    from coa_extract ce where ce.package_tag = pkg.tag
    order by ce.report_date desc nulls last limit 1
  ) c on true
)
select
  tag, item_name, license, lab_testing_state,
  round(lb::numeric, 2)                                            as pounds,
  quantity,
  a_platform_ours                                                  as platform_says_ours,
  a_licence                                                        as platform_read_this_licence,
  b_lineage                                                        as lineage_says,
  b_detail->'origin_names'                                         as lineage_origin,
  b_detail->'inbound_manifests'                                    as lineage_inbound_manifest,
  c_ours                                                           as certificate_says_ours,
  client_name                                                      as certificate_client,
  client_license                                                   as certificate_licence,
  report_date                                                      as certificate_dated,
  case
    when c_ours is null then 'NO CERTIFICATE EVIDENCE'
    when a_platform_ours = c_ours and (b_lineage = 'ours') = c_ours then 'ALL THREE AGREE'
    when (b_lineage = 'ours') = c_ours and a_platform_ours <> c_ours
      then 'PLATFORM IS THE ODD ONE OUT — lineage and the certificate agree against it'
    when a_platform_ours = c_ours and (b_lineage = 'ours') <> c_ours then 'LINEAGE IS THE ODD ONE OUT'
    when b_lineage = 'blended' then 'BLENDED — several origins, no recorded proportions, no single answer exists'
    else 'CERTIFICATE DISAGREES WITH BOTH INTERNAL SOURCES'
  end                                                              as agreement,
  case
    when c_ours is false and b_lineage = 'ours'
      then 'The certificate names another licensee, but the lineage says we grew it. Most likely '
        || 'the sample was submitted by whoever held it at test time — NOT evidence we do not own '
        || 'it. Confirm against the inbound manifest before treating this as third party.'
    when c_ours is false and b_lineage = 'third_party' and a_platform_ours
      then 'Two independent sources say this is not ours and the platform counts it as our '
        || 'production. This is the one to act on.'
    when c_ours is null and lab_testing_state in ('TestPassed','TestFailed')
      then 'It was tested, so a certificate exists in Metrc — it has not been fetched. '
        || 'Until it is, ownership rests on internal fields only, which rule C0 forbids as proof.'
    when c_ours and client_name is not null and client_name not ilike '%twisted%'
      then 'The certificate licence is ours but the client NAME is another company. Worth reading '
        || 'the document before relying on it.'
  end                                                              as how_to_read_it,
  c_licence_count                                                  as licences_named_on_certificate,
  case
    when c_licence_count > 1
      then 'This certificate names ' || c_licence_count || ' licences in one field. Any one of '
        || 'them being ours makes it ours — 621 certificates print both of our licences together.'
  end                                                              as certificate_parse_note
from withcoa;

grant select on v_ownership_evidence to authenticated;
revoke all on v_ownership_evidence from anon;;
