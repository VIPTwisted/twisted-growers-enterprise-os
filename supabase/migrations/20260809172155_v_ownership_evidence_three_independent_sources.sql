-- OWNERSHIP, DERIVED THREE INDEPENDENT WAYS. Rule C0: "ownership stops at the
-- COA — an internal field cannot disconfirm another internal field."
--
-- Two of the three sources live inside Metrc, so they are not independent of
-- each other. The certificate is a document produced by an outside laboratory
-- and is the only external evidence the platform holds.
--
--   A · PLATFORM      f_is_ours(raw->>'ItemFromFacilityLicenseNumber')
--                     The item DEFINITION. Read by 21 views. Wrong on 21.4% of
--                     on-hand pounds because a repackaged child does not inherit
--                     its parent's provenance.
--   B · LINEAGE       f_material_origin(tag) — walks SourcePackageLabels back to
--                     the inbound manifest. Internal, but follows the material.
--   C · CERTIFICATE   coa_extract.client_license — who commissioned the test.
--                     External. 972 of 983 parsed.
--
-- ⚠ THE TRAP IN SOURCE C, AND IT WOULD BE EASY TO SHIP THE WRONG CONCLUSION.
-- 887 of 972 certificates name someone else. That is NOT 887 packages we do not
-- own. client_license names who SUBMITTED THE SAMPLE — and when we buy material
-- that the seller already had tested, the certificate correctly names the
-- seller for material we now legitimately own. The certificate answers
-- "who owned it AT TEST TIME", which is evidence about ownership, not a
-- statement of it.
--
-- So this view REPORTS the three answers and names the disagreement. It does not
-- pick a winner where the sources can legitimately differ. Disagreement is the
-- finding; only the owner arbitrates.
create or replace view v_ownership_evidence as
with pkg as (
  select p.tag,
         p.item_name,
         p.license,
         p.lab_testing_state,
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
         c.client_license                                          as c_licence,
         c.client_name                                             as c_client,
         case when c.client_license is null or c.client_license = '' then null
              when f_is_ours(c.client_license) then true else false end as c_ours,
         c.report_date
  from pkg
  left join lateral (
    select ce.client_license, ce.client_name, ce.report_date
    from coa_extract ce
    where ce.package_tag = pkg.tag
    order by ce.report_date desc nulls last
    limit 1
  ) c on true
)
select
  tag, item_name, license, lab_testing_state,
  round(lb::numeric, 2)                                            as pounds,
  quantity,

  -- A
  a_platform_ours                                                  as platform_says_ours,
  a_licence                                                        as platform_read_this_licence,
  -- B
  b_lineage                                                        as lineage_says,
  b_detail->'origin_names'                                         as lineage_origin,
  b_detail->'inbound_manifests'                                    as lineage_inbound_manifest,
  -- C
  c_ours                                                           as certificate_says_ours,
  c_client                                                         as certificate_client,
  c_licence                                                        as certificate_licence,
  report_date                                                      as certificate_dated,

  case
    when c_ours is null then 'NO CERTIFICATE EVIDENCE'
    when a_platform_ours = c_ours and (b_lineage = 'ours') = c_ours
      then 'ALL THREE AGREE'
    when (b_lineage = 'ours') = c_ours and a_platform_ours <> c_ours
      then 'PLATFORM IS THE ODD ONE OUT — lineage and the certificate agree against it'
    when a_platform_ours = c_ours and (b_lineage = 'ours') <> c_ours
      then 'LINEAGE IS THE ODD ONE OUT'
    when b_lineage = 'blended'
      then 'BLENDED — several origins, no recorded proportions, no single answer exists'
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
  end                                                              as how_to_read_it
from withcoa;

comment on view v_ownership_evidence is
  'Ownership derived three independent ways — the platform item field, the Metrc package lineage, and the laboratory certificate. Only the certificate is external, which is what rule C0 requires. Reports the disagreement and never picks a winner where the sources can legitimately differ: a certificate naming the seller is normal for material bought in after testing.';

grant select on v_ownership_evidence to authenticated;
revoke all on v_ownership_evidence from anon;

insert into nav_registry (category, category_order, label, item_order, icon, view_key,
                          table_ref, description, enabled, admin_only, surface, subcategory)
values ('Command Center', 0, 'Ownership — three independent sources', 1, 'gauge',
        'ownership_evidence', 'v_ownership_evidence',
        'Whose material is it, answered three ways: the platform field, the package lineage, and the laboratory certificate. Only the certificate is external evidence. Where they disagree the row says so and names which is the odd one out.',
        true, false, 'deep', 'Third Party')
on conflict do nothing;;
