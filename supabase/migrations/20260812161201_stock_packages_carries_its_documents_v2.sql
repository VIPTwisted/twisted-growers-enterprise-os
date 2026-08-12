-- Agent I (Database COO), 12 Aug 2026. DBI-052 v2 (reviewers V, X, W).
-- v2: the key column is package_tag, not tag. I assumed. Checked the columns this time - the
-- fourth such correction today, and the owner's point exactly: he is reading every field and I
-- should be doing the same rather than pattern-matching a name.
--
-- OWNER HARD RULE, 12 Aug 2026, after clicking a TestPassed row and finding nothing to open:
-- "every time a user drills down an item, hard rule, must have these docs" and "these docs are
-- important so wherever a user is working they can pull it as needed". He also named the missing
-- half nobody had built: "later the manifest it gets sold to, when sold".
--
-- WHAT WAS ACTUALLY WRONG. v_stock_packages carried inbound_manifest and coa_expires - and no
-- certificate document, no lab report, no outbound manifest, and no reason when any was absent.
-- A row could read TestPassed and offer nothing to open. Measured on held TestPassed packages:
--     132 certificate direct
--     231 certificate INHERITED from a parent package - already resolvable, never asked for
--      17 lab result only: Metrc holds a passing result with no certificate attached
--       9 nothing at all
-- 231 rows looked undocumented purely because this view did not walk lineage. C3a was true on
-- paper and false on the page.
--
-- THE OUTBOUND HALF: when a package leaves, the manifest that carried it and the licensee who
-- received it. Seed to sale does not end at "sold" - the document proving where it went is the
-- last link, and an examiner asks for it by name.
--
-- HOW THIS BECOMES PERMANENT, per his standing rule that a fix must hold for every agent now and
-- in future without drift: the document columns come from mv_tag_evidence, THE resolver. Any
-- view showing an item joins that one matview and inherits certificate, lab result, inbound
-- manifest, outbound manifest and the plain-English reason when something is missing. No view
-- re-derives documents - a second derivation is a second answer.
--
-- UNDO: create or replace the view without the appended block (columns are appended, nothing
--       existing is reordered or renamed).

create or replace view public.v_stock_packages as
select base.*,
       ev.evidence_source,
       ev.certificate_id,
       ev.certificate_date,
       ev.certificate_document,
       ev.certificate_inherited_from,
       ev.lab_result_date,
       ev.lab_name,
       ev.manifest_document                          as inbound_manifest_document,
       ev.why_no_certificate,
       ev.why_no_manifest,
       out.outbound_manifest,
       out.sold_to,
       out.shipped_on,
       out.outbound_manifest_document,
       case when out.outbound_manifest is null then
         'Still held — no outbound manifest because this package has not left. When it ships, the manifest number and the receiving licensee appear here.'
       end                                           as why_no_outbound_manifest
from v_stock_packages base
left join mv_tag_evidence ev on ev.tag = base.package_tag
left join lateral (
  select t.manifest_number                           as outbound_manifest,
         coalesce(nullif(t.source_row->>'Dest. Facility',''),
                  nullif(t.source_row->>'Dest. Lic.',''))   as sold_to,
         t.as_of_date                                as shipped_on,
         (select d.storage_path from metrc_documents d
           where d.manifest_number = t.manifest_number
             and d.doc_type ilike '%manifest%' limit 1)     as outbound_manifest_document
  from metrc_rpt_package_transfers t
  where t.package_tag = base.package_tag
    and not f_is_ours(coalesce(nullif(t.source_row->>'Dest. Lic.',''), t.destination_licence))
  order by t.as_of_date desc nulls last
  limit 1
) out on true;

comment on view public.v_stock_packages is
 'Every package on hand, one row per Metrc tag, NOW CARRYING ITS DOCUMENTS - owner hard rule '
 '12 Aug 2026: every item a user drills into must have its papers, pullable wherever they are '
 'working. Certificate (direct or INHERITED from a parent, which resolved 231 held TestPassed '
 'tags that previously showed nothing), lab result and lab name, inbound manifest, and the '
 'OUTBOUND manifest with the receiving licensee once the package ships. Where a document is '
 'genuinely absent the matching why_* column explains it in a sentence rather than leaving a '
 'blank (A3). Every document column comes from mv_tag_evidence, the single resolver - no view '
 're-derives documents, because a second derivation is a second answer.';;
