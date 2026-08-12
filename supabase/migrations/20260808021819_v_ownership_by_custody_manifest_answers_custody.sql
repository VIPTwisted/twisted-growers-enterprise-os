-- OWNER RULING, 8 Aug 2026: "COA is lab testing and manifest is the shipping
-- company. Both required by law."
--
-- THIS DISSOLVES THE TIE-BREAK PROBLEM RATHER THAN SOLVING IT.
--
-- Agent D judged OWNERSHIP from the certificate, which forced a choice between
-- certificates at different lineage depths. The Inspector showed that choice WAS
-- the verdict: shallowest-wins gives 19 packages CONFIRMED NOT OURS, deepest-wins
-- gives 156, from identical data - 142 of 191 verdicts decided by an ORDER BY.
--
-- The error was upstream of the ordering. The two documents answer different legal
-- questions:
--     COA      - WHAT is it, WAS IT TESTED, and by whom. Its "client" is whoever
--                submitted the sample and paid the laboratory.
--     MANIFEST - WHO SHIPPED IT and WHO RECEIVED IT. It is the chain of custody.
-- Ownership is a CUSTODY question, so the manifest answers it and the certificate
-- corroborates identity and testing. Asking a testing document who owns something
-- is why a sort order could move the answer eight-fold.
--
-- The Inspector reached the same conclusion by an independent route (F2): the Metrc
-- packages-transferred export names a real outside producer for 146 of the 149
-- packages the certificate route called INCONCLUSIVE.
--
-- Custody here comes from metrc_rpt_package_transfers - the state's own export,
-- carrying 'Origin Lic.' per package line - and NOT from any certificate.
-- UNDO: drop view v_ownership_by_custody;

create or replace view public.v_ownership_by_custody as
with pkg as (
  select distinct on (tag) tag, item_name, uom, quantity, source_state, lab_testing_state,
         raw->>'ItemFromFacilityLicenseNumber' as item_license,
         raw->>'SourcePackageCount'            as source_packages
  from metrc_packages order by tag, license
),
-- Every licence that ever shipped this package or any ancestor to us, from the
-- state's custody export. Transporters and laboratories are movement, not origin.
custody as (
  select t.package_tag,
         string_agg(distinct t.source_row->>'Origin Lic.', ', ')
           filter (where t.source_row->>'Origin Lic.' is not null)          as origin_licences,
         string_agg(distinct t.manifest_number, ', ')                       as manifests,
         count(*)                                                          as custody_events
  from metrc_rpt_package_transfers t
  group by t.package_tag
)
select p.tag                                     as package_tag,
       left(p.item_name, 50)                     as item_name,
       p.source_state,
       f_quantity_text(p.quantity, p.uom)        as how_much,
       case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity, p.uom), 2) end as pounds,
       case when not f_is_weight(p.uom) then p.quantity end as units,
       p.item_license                            as item_field_says,
       c.origin_licences                         as custody_says,
       c.manifests,
       c.custody_events,
       -- The certificate is shown for CORROBORATION of identity and testing. It is
       -- deliberately NOT part of the verdict.
       r.cert_client                             as certificate_client,
       r.cert_license                            as certificate_licence,
       r.certificate_link,
       case
         when c.package_tag is null
           then 'NO CUSTODY RECORD - never appeared on a manifest line. Cannot judge ownership from a testing document; get the manifest.'
         when c.origin_licences is null
           then 'CUSTODY RECORD WITHOUT AN ORIGIN LICENCE - the export line is incomplete.'
         when f_all_ours(c.origin_licences)
           then 'OURS - every custody origin on the manifests is one of our licences.'
         when not f_any_ours(c.origin_licences)
           then 'NOT OURS - the manifests name only outside licences as origin.'
         else 'MIXED - the manifests name both our licences and outside ones. Needs the line detail.'
       end                                       as custody_verdict,
       -- Two-way check, kept visible rather than resolved.
       case
         when r.cert_license is null or c.origin_licences is null then null
         when f_any_ours(r.cert_license) = f_any_ours(c.origin_licences) then 'agree'
         else 'DISAGREE - certificate and manifest point different ways'
       end                                       as certificate_vs_custody
from pkg p
left join custody c on c.package_tag = p.tag
left join v_certificate_resolved r on r.package_tag = p.tag
where p.source_state = any (array['active','onhold']);

comment on view public.v_ownership_by_custody is
  'Ownership judged from the MANIFEST - the legal chain of custody - not from the '
  'certificate. Owner ruling 8 Aug 2026: the COA is lab testing, the manifest is '
  'shipping, both required by law. Judging ownership from a certificate forced a '
  'choice between certificates at different depths, and that ordering was deciding '
  '142 of 191 verdicts. certificate_vs_custody is the two-way check: where the two '
  'documents disagree, the disagreement is the finding and must not be resolved by '
  'preferring one silently.';;
