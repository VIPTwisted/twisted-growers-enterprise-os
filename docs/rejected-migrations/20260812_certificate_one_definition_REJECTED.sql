-- Agent P (Parser & Documents), 12 August 2026.
-- ONE definition of "does this tag have a certificate", and the bridge that
-- releases 16 held packages without a single Metrc call.
--
-- WRITTEN, NOT APPLIED. This touches shared primitives with 13 dependent
-- objects and Agent B's read surface (v_stock_packages). Per the audit
-- assertion `authorisation`, a schema change takes three independent
-- reviewers. Agent I to apply. Agent V and Agent X to review.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS ACTUALLY WRONG.
--
-- The owner ruled: if Metrc says TestPassed, a certificate EXISTS — find it.
-- For 16 of the 26 held packages the certificate was never missing. It was
-- fetched, stored and parsed weeks ago. Nothing joined it to the tag.
--
-- Metrc's lab result carries document_file_id — the id of the certificate PDF
-- behind that result. Measured 12 Aug 2026:
--
--     distinct document_file_id in metrc_lab_results        983
--     doc_type='coa' rows in metrc_documents                983
--     of those that match on metrc_id                       983   (0 unmatched)
--     rows in coa_extract                                   983
--
-- Every certificate Metrc has ever named is already on disk and already
-- parsed. But:
--
--     tags Metrc links to a certificate (via lab result)   1,904
--     tags coa_extract stamps                                969
--     ─────────────────────────────────────────────────────────
--     tags holding a certificate with no coa_extract row     935
--
-- Because ONE certificate covers MANY tags — 431 certificates cover more than
-- one tag, and one covers 24. coa_extract.package_tag records the single tag
-- the document happened to be fetched under. That is correct and must not
-- change: coa_extract holds WHAT THE DOCUMENT PRINTED. The many-tags
-- relationship belongs in resolution, and metrc_lab_results.document_file_id
-- is the join that expresses it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- FIVE DEFINITIONS, FIVE ANSWERS. Measured on the same 26 tags, 12 Aug 2026:
--
--     mv_tag_evidence          says  0 are certified   <- the inventory surface
--     v_tag_coa_gap            says  0
--     mv_tag_coa_lineage       says  1
--     v_certificate_resolved   says 15                 <- 9 views consume this
--     mv_tag_certificate       says 19                 <- counts a bare lab
--                                                         result as a certificate;
--                                                         its own
--                                                         certificate_document
--                                                         is null on all 4 extras
--
-- Owner ruling hold_the_ddc_discipline: count the definitions of any primitive,
-- more than one is the defect, and when a second appears DELETE ONE rather than
-- improve both. There are five. This migration reduces it to one.
--
-- Neither leading definition was right on its own:
--   * v_certificate_resolved already had the document_file_id bridge (correct)
--     but walked lineage over metrc_packages only, so it loses any parent that
--     has shipped out and left the mirror.
--   * mv_tag_certificate walked lineage over metrc_packages UNION
--     metrc_rpt_package_transfers.source_package (correct — this is owner
--     ruling tag_missing_means_go_find_the_manifest) but graded a bare lab
--     result as a certificate.
-- The right answer is mv_tag_certificate's LINEAGE with
-- v_certificate_resolved's CERTIFICATE TEST. Worked example: package
-- 1A40A030000E5B2000011010 (0.996 lb of Lemon Mintz pre-rolls). Its parent
-- 1A40A030000E5B2000014336 shipped to Green Stratus on manifest 0003360724 and
-- left the mirror, so the package-only walk finds nothing. The transfer record
-- still carries the edge, and two hops up sits certificate 2500002.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY "direct" CANNOT SIMPLY ABSORB THE BRIDGE, which is the trap in the
-- obvious version of this fix.
--
-- v_certificate_resolved reports found_at_depth = 0 both when a parsed
-- certificate NAMES the tag and when Metrc merely says the tag's result came
-- from a certificate we hold. Wiring mv_tag_evidence straight through would
-- reclassify 935 tags as 'direct' and overstate the evidence: a certificate
-- that does not print this tag is not direct evidence for it. The basis has to
-- travel with the answer. Hence certificate_grade below, and hence five
-- honest values instead of three.
--
-- HELD STOCK UNDER THE HONEST CLASSIFIER — 1,118 tags, 2,459.46 lb:
--
--   1 direct        parsed certificate names this tag              166   924.83 lb
--   2 on file       Metrc names the file; document does not
--                   name the tag                                   307   696.45 lb
--   3 inherited     parsed certificate on an ancestor              219   457.15 lb
--   4 inherited     ancestor's lab result names the file           306   185.80 lb
--     via Metrc
--   5 lab result    Metrc attached no certificate document          14     6.78 lb
--     only
--   6 none          nothing anywhere                               106   188.45 lb
--
-- Against what the platform says today (direct 166 / inherited 800 /
-- lab result only 30 / none 122), the movement is:
--
--     none            -> certified      16 tags    5.50 lb   RELEASED
--     lab result only -> certified      16 tags   17.90 lb   RELEASED
--     nothing moves down. Measured: 0 tags lose evidence.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES NOT FIX, AND MUST BE SAID.
--
--   * 7 of the 26 (60.37 lb) resolve to NOTHING and this migration does not
--     help them. Four are the 10 Aug flower — 1A40A030000E5B1000006115,
--     ...6117, ...6119, ...6121, 60.05 lb — whose testing samples ...6116,
--     ...6118, ...6120, ...6122 are still 'intransit' in our mirror. They
--     passed on 10 Aug and the result was never fetched. They need TG-01's
--     re-queue (20260812_lab_results_natural_key_and_queue.sql), not this.
--     The three others are ...004908, ...001031 and ...006858, 0.32 lb.
--   * 3 of the 26 (2.61 lb) have a lab result on an ancestor with
--     document_file_id NULL: ...001439, ...000492, ...000327. Metrc holds the
--     result and attached no document. This is lab-specific and not a bug in
--     our retrieval — measured attach rate by laboratory:
--         Analytics Labs           100.0%      Green Analytics MA     100.0%
--         Smithers AMS             100.0%      Kaycha MA               99.1%
--         Green Valley              79.1%      MCR Labs                71.6%
--         G7 Lab                    71.4%      ProVerde                25.0%
--         SafeTiva Labs             12.1%      Aries Laboratories       0.0%
--         Assured Testing            0.0%
--     For those the certificate must come from the laboratory or, last resort,
--     Apex. It is not in the Metrc API.
--   * 463 tags platform-wide resolve to a certificate whose client licence is
--     not ours (Alternative Compassion Services and others, on bought-in
--     material). That is legitimate — the supplier's certificate is the
--     certificate — but it must never be presented as ours. Hence
--     certificate_client and certificate_client_is_ours below. f_any_ours is
--     used, never f_is_ours: 621 of 983 certificates carry a LIST
--     ("MC281714, MP281909") and f_is_ours returns false on the whole string.
--   * The tie-break when two certificates sit at the same depth is not
--     deterministic in either old definition and is not made deterministic
--     here. 48 held tags change which certificate is cited, all at the SAME
--     depth — no tag moves nearer or farther. Registered as an open question
--     rather than silently settled.
--   * mv_tag_certificate and mv_tag_coa_lineage become redundant once this
--     lands. They are NOT dropped here — that is a separate change with its
--     own reviewers. Until they go there are still three definitions, and the
--     check in section 4 will say so.
--
-- METRC IS READ-ONLY THROUGHOUT. This migration makes no external call.
--
-- UNDO, in full: restore the prior bodies of v_certificate_resolved,
-- mv_tag_evidence, v_stock_packages, v_stock_proof, v_concentrate_valuation
-- and v_missing_lab_results from git, then
--   refresh materialized view mv_tag_evidence;
--   delete from verification_checks where check_key like 'certificate_one_%';

begin;

-- ── 1 · the single resolver, carrying its own basis ──────────────────────────
-- Columns are APPENDED, never reordered or removed, so all nine existing
-- consumers keep working unchanged: v_certificate_gap, v_document_package_link,
-- v_inventory_report, v_never_tested_proof, v_never_tested_reconciliation,
-- v_ownership_by_custody, v_ownership_verdict, v_package_dossier.
create or replace view public.v_certificate_resolved as
with recursive edges as (
  -- lineage from the package record...
  select upper(btrim(c.raw->>'Label')) as child, upper(btrim(pt.tag)) as parent
  from metrc_packages c
  cross join lateral unnest(string_to_array(c.raw->>'SourcePackageLabels', ', ')) pt(tag)
  where nullif(c.raw->>'SourcePackageLabels','') is not null
    and nullif(btrim(pt.tag),'') is not null
  union
  -- ...and from the transfer report, which is the only place an edge survives
  -- once the parent has shipped out and left the mirror. Owner ruling
  -- tag_missing_means_go_find_the_manifest.
  select upper(btrim(t.package_tag)), upper(btrim(t.source_package))
  from metrc_rpt_package_transfers t
  where nullif(btrim(t.source_package),'') is not null
    and upper(btrim(t.source_package)) <> upper(btrim(t.package_tag))
),
candidate as (
  -- rank 1: the document itself names the tag. The strongest evidence there is.
  select upper(btrim(c.package_tag)) as tag, 1 as rank, c.document_id,
         c.client_license as lic, c.client_name as nm, c.lab_report_id as rpt,
         'parsed certificate names this tag'::text as grade
  from coa_extract c where c.package_tag is not null
  union all
  -- rank 2: THE BRIDGE. Metrc's lab result for this tag names a certificate
  -- file we hold and have parsed. Real evidence, but the document does not
  -- print this tag, so it is graded separately and never called 'direct'.
  select upper(btrim(l.package_tag)), 2, e.document_id,
         e.client_license, e.client_name, e.lab_report_id,
         'Metrc lab result names this certificate'::text
  from metrc_lab_results l
  join coa_extract e on e.document_id = l.document_file_id
  where l.document_file_id is not null and l.package_tag is not null
),
cert as (
  select distinct on (tag) tag, rank, document_id, lic, nm, rpt, grade
  from candidate order by tag, rank, document_id
),
universe as (
  select distinct upper(btrim(raw->>'Label')) as tag from metrc_packages
  union
  select distinct upper(btrim(package_tag)) from metrc_rpt_package_transfers
  where package_tag is not null
),
walk as (
  select u.tag, u.tag as node, 0 as hops from universe u
  union all
  select w.tag, e.parent, w.hops + 1
  from walk w join edges e on e.child = w.node
  where w.hops < 8 and not exists (select 1 from cert c where c.tag = w.node)
),
hit as (
  select distinct on (w.tag) w.tag, w.node as ancestor, w.hops, c.*
  from walk w join cert c on c.tag = w.node
  order by w.tag, w.hops, c.rank, c.document_id
)
select
  h.tag                        as package_tag,
  h.hops                       as found_at_depth,
  h.ancestor                   as certificate_on_package,
  h.lic                        as cert_license,
  h.nm                         as cert_client,
  h.rpt                        as cert_report,
  case when h.hops = 0 then 'DIRECT'
       else 'INHERITED via ' || h.hops || ' repack' || case when h.hops > 1 then 's' else '' end
  end                          as certificate_link,
  -- appended from here; nothing above changes name, type or position
  h.document_id                as certificate_document,
  h.grade                      as certificate_basis,
  case
    when h.hops = 0 and h.rank = 1 then 'direct'
    when h.hops = 0 and h.rank = 2 then 'certificate on file'
    when h.hops  > 0 and h.rank = 1 then 'inherited'
    else                                 'inherited via Metrc'
  end                          as certificate_grade,
  f_any_ours(h.lic)            as certificate_client_is_ours
from hit h;

comment on view public.v_certificate_resolved is
  'THE single definition of which certificate belongs to a tag. Lineage walks '
  'metrc_packages AND metrc_rpt_package_transfers, because a parent that has '
  'shipped out leaves the mirror but keeps its transfer edge. A certificate is '
  'a PARSED DOCUMENT we hold — either because it names the tag (rank 1) or '
  'because Metrc''s lab result for the tag names that certificate file (rank 2, '
  'the bridge: 935 tags hold a certificate this way and had no coa_extract row). '
  'A bare lab result with no document is NOT a certificate here; that is why '
  'mv_tag_certificate reports more. certificate_grade carries the basis so no '
  'consumer can present rank 2 as direct evidence. certificate_client_is_ours '
  'uses f_any_ours, never f_is_ours — 621 of 983 certificates carry a licence '
  'LIST and f_is_ours returns false on the whole string.';

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 · mv_tag_evidence rebuilt on the single resolver.
-- Separate transaction: this drops and recreates four dependent views and
-- should be reviewed as its own unit.
--
-- No CASCADE anywhere. Objects are dropped in dependency order by name, which
-- is what tools/hooks/guard-sql.mjs requires and also what makes the diff
-- reviewable.

begin;

drop view if exists public.v_stock_proof;
drop view if exists public.v_concentrate_valuation;
drop view if exists public.v_missing_lab_results;
drop view if exists public.v_stock_packages;
drop materialized view if exists public.mv_tag_evidence;

create materialized view public.mv_tag_evidence as
with pkg as (
  select distinct on (p.tag) p.tag, p.item_name, p.lab_testing_state, p.raw
  from metrc_packages p
  order by p.tag,
           (p.source_state = 'active' and not coalesce(p.finished, false)) desc,
           (p.raw->>'LastModified') desc nulls last
)
select
  p.tag,
  p.item_name,
  p.lab_testing_state,
  -- five honest values where there were three. 'certificate on file' and
  -- 'inherited via Metrc' are new and are the 935-tag population.
  coalesce(r.certificate_grade,
           case when lr.package_tag is not null then 'lab result only' else 'none' end
  )                                              as evidence_source,
  coalesce(dc.lab_report_id, ic.lab_report_id)   as certificate_id,
  coalesce(dc.report_date,   ic.report_date)     as certificate_date,
  coalesce(dc.total_thc,     ic.total_thc)       as total_thc,
  nullif(r.certificate_on_package, p.tag)        as certificate_inherited_from,
  coalesce(cd.storage_path, lr.coa_link)         as certificate_document,
  lr.result_date                                 as lab_result_date,
  lr.lab_facility                                as lab_name,
  mt.manifest_number,
  md.storage_path                                as manifest_document,
  case
    when r.certificate_grade is not null then null::text
    when lr.package_tag is not null then
      'Tested — Metrc holds a lab result'
      || coalesce(' dated ' || to_char(lr.result_date::timestamptz, 'DD Mon YYYY'), '')
      || coalesce(' from ' || lr.lab_facility, '')
      || ', and that laboratory attached no certificate document to it. The test '
      || 'happened and the certificate exists at the laboratory; the Metrc API '
      || 'does not carry it. Request it from the laboratory, or Apex as a last resort.'
    when p.lab_testing_state = 'NotSubmitted' then
      'Never submitted for testing. No certificate because there was no test — '
      || 'this material cannot be sold until it is submitted.'
    else
      'Looked in three places and found nothing: no parsed certificate naming this '
      || 'tag, none on up to eight generations of parents (following both package '
      || 'lineage and transfer records), and no Metrc lab result naming a certificate '
      || 'file. Lab state is ' || coalesce(p.lab_testing_state, 'unknown')
      || '. If Metrc says it passed, the certificate exists and has not been fetched '
      || 'yet — this is our retrieval, not the material.'
  end                                            as why_no_certificate,
  case when mt.manifest_number is null then
    'No inbound manifest line for this tag in the transfer report. Either it was '
    || 'produced here — check the parent packages — or the transfer report has not '
    || 'been imported for that period.'
  end                                            as why_no_manifest,
  -- appended: the basis must travel with the answer, and a supplier's
  -- certificate must never read as ours.
  r.certificate_basis,
  r.found_at_depth                               as certificate_hops,
  r.cert_client                                  as certificate_client,
  r.cert_license                                 as certificate_client_license,
  coalesce(r.certificate_client_is_ours, false)  as certificate_client_is_ours
from pkg p
left join v_certificate_resolved r on r.package_tag = p.tag
left join lateral (
  select c.lab_report_id, c.report_date, c.total_thc, c.package_tag
  from coa_extract c where c.package_tag = p.tag
  order by c.report_date desc nulls last limit 1) dc on true
left join lateral (
  select c.lab_report_id, c.report_date, c.total_thc
  from coa_extract c where c.package_tag = r.certificate_on_package
  order by c.report_date desc nulls last limit 1) ic on true
left join lateral (
  select d.storage_path from metrc_documents d
  where d.metrc_id = r.certificate_document and d.doc_type ilike '%coa%'
  limit 1) cd on true
left join lateral (
  select l2.package_tag, l2.result_date, l2.lab_facility, l2.coa_link
  from metrc_lab_results l2 where l2.package_tag = p.tag
  order by l2.result_date desc nulls last limit 1) lr on true
left join lateral (
  select t.manifest_number from metrc_rpt_package_transfers t
  where t.package_tag = p.tag order by t.as_of_date desc nulls last limit 1) mt on true
left join lateral (
  select d2.storage_path from metrc_documents d2
  where d2.manifest_number = mt.manifest_number and d2.doc_type ilike '%manifest%'
  limit 1) md on true;

create unique index mv_tag_evidence_uq  on public.mv_tag_evidence (tag);
create        index mv_tag_evidence_src on public.mv_tag_evidence (evidence_source);

comment on materialized view public.mv_tag_evidence is
  'Certificate and manifest evidence per tag. Delegates the whole certificate '
  'question to v_certificate_resolved rather than walking lineage a second time '
  '— that second walk was the defect: it inherited CERTIFICATES through lineage '
  'but never consulted metrc_lab_results.document_file_id, so 935 tags holding a '
  'parsed certificate read as having none. evidence_source has FIVE values, not '
  'three: direct, certificate on file, inherited, inherited via Metrc, lab '
  'result only, none. "certificate on file" and "inherited via Metrc" mean the '
  'certificate is real and in hand but the document does not print this tag — '
  'never present those as direct evidence. Refreshed by tg_refresh_dashboards, '
  'every 10 minutes.';

-- v_stock_packages: recreated verbatim except that the five new evidence
-- columns are APPENDED. Agent B's front end names its columns, so nothing
-- existing moves.
create view public.v_stock_packages as
 SELECT p.tag AS package_tag,
    p.item_name,
    p.raw #>> '{Item,StrainName}'::text[] AS strain,
        CASE
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%fresh frozen%'::text THEN 'Fresh frozen'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%bud%'::text THEN 'Dried flower'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%shake%'::text OR (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%trim%'::text THEN 'Shake and trim'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%concentrate%'::text THEN 'Concentrate'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%roll%'::text THEN 'Pre-rolls'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%vape%'::text THEN 'Vape'::text
            ELSE COALESCE(p.raw #>> '{Item,ProductCategoryName}'::text[], '(uncategorised)'::text)
        END AS stream,
        CASE
            WHEN f_is_ours(p.raw ->> 'ItemFromFacilityLicenseNumber'::text) THEN 'Grown by us'::text
            ELSE 'Bought in'::text
        END AS origin,
    COALESCE(NULLIF(p.raw ->> 'ItemFromFacilityName'::text, ''::text), 'not recorded'::text) AS made_by,
    COALESCE(NULLIF(p.raw ->> 'ReceivedFromFacilityName'::text, ''::text), '—'::text) AS shipped_to_us_by,
    NULLIF(p.raw ->> 'ReceivedFromManifestNumber'::text, ''::text) AS inbound_manifest,
    p.license,
    p.location,
    p.raw ->> 'LabTestingState'::text AS lab_state,
    round(p.quantity) AS quantity,
    p.uom,
    round(f_to_pounds(p.quantity, p.uom), 3) AS pounds,
    p.packaged_on,
    CURRENT_DATE - p.packaged_on AS days_here,
    NULLIF(p.raw ->> 'SourceHarvestNames'::text, ''::text) AS source_harvest,
    NULLIF(p.raw ->> 'SourcePackageLabels'::text, ''::text) AS made_from_packages,
    NULLIF(p.raw ->> 'SourceProductionBatchNumbers'::text, ''::text) AS production_batch,
    (p.raw ->> 'LabTestingStateDate'::text)::date AS submitted_on,
    (p.raw ->> 'LabTestingRecordedDate'::text)::date AS result_on,
    (p.raw ->> 'LabTestResultExpirationDateTime'::text)::date AS coa_expires,
    h.harvest_start AS harvest_cut_on,
    COALESCE(NULLIF(h.raw ->> 'DryingLocationName'::text, ''::text), '—'::text) AS dried_in,
    (h.raw ->> 'FinishedDate'::text)::date AS harvest_closed_on,
        CASE
            WHEN NULLIF(p.raw ->> 'SourceHarvestNames'::text, ''::text) IS NOT NULL THEN 'Traceable to harvest '::text || (p.raw ->> 'SourceHarvestNames'::text)
            WHEN NULLIF(p.raw ->> 'SourcePackageLabels'::text, ''::text) IS NOT NULL THEN 'Made from package '::text || (p.raw ->> 'SourcePackageLabels'::text)
            WHEN NOT f_is_ours(p.raw ->> 'ItemFromFacilityLicenseNumber'::text) THEN (('BOUGHT IN — no harvest of ours to trace to. Its history sits with '::text || COALESCE(NULLIF(p.raw ->> 'ItemFromFacilityName'::text, ''::text), 'the supplier'::text)) || COALESCE(', arrived on manifest '::text || NULLIF(p.raw ->> 'ReceivedFromManifestNumber'::text, ''::text), ''::text)) || '. Ask them for the certificate and cultivation record.'::text
            ELSE 'NO SOURCE RECORDED in Metrc — neither a harvest nor a parent package. This is a lineage gap and should be corrected.'::text
        END AS traceability,
    f_is_weight(p.uom) AS sold_by_weight,
        CASE
            WHEN NOT f_is_weight(p.uom) THEN round(p.quantity)
            ELSE NULL::numeric
        END AS units,
        CASE
            WHEN f_is_weight(p.uom) THEN round(f_to_pounds(p.quantity, p.uom), 3)::text || ' lb'::text
            ELSE (round(p.quantity)::text || ' '::text) || COALESCE(p.uom, 'units'::text)
        END AS quantity_shown,
    ev.evidence_source,
    ev.certificate_id,
    ev.certificate_date,
    ev.certificate_document,
    ev.certificate_inherited_from,
    ev.lab_result_date,
    ev.lab_name,
    ev.manifest_document AS inbound_manifest_document,
    ev.why_no_certificate,
    ev.why_no_manifest,
    "out".outbound_manifest,
    "out".sold_to,
    "out".shipped_on,
    "out".outbound_manifest_document,
        CASE
            WHEN "out".outbound_manifest IS NULL THEN 'Still held — no outbound manifest because this package has not left. When it ships, the manifest number and the receiving licensee appear here.'::text
            ELSE NULL::text
        END AS why_no_outbound_manifest,
    -- appended
    ev.certificate_basis,
    ev.certificate_hops,
    ev.certificate_client,
    ev.certificate_client_license,
    ev.certificate_client_is_ours
   FROM metrc_packages p
     LEFT JOIN metrc_harvests h ON h.name = split_part(COALESCE(p.raw ->> 'SourceHarvestNames'::text, ''::text), ','::text, 1)
     LEFT JOIN mv_tag_evidence ev ON ev.tag = p.tag
     LEFT JOIN LATERAL ( SELECT t.manifest_number AS outbound_manifest,
            COALESCE(NULLIF(t.source_row ->> 'Dest. Facility'::text, ''::text), NULLIF(t.source_row ->> 'Dest. Lic.'::text, ''::text)) AS sold_to,
            t.as_of_date AS shipped_on,
            ( SELECT d.storage_path
                   FROM metrc_documents d
                  WHERE d.manifest_number = t.manifest_number AND d.doc_type ~~* '%manifest%'::text
                 LIMIT 1) AS outbound_manifest_document
           FROM metrc_rpt_package_transfers t
          WHERE t.package_tag = p.tag AND NOT f_is_ours(COALESCE(NULLIF(t.source_row ->> 'Dest. Lic.'::text, ''::text), t.destination_licence))
          ORDER BY t.as_of_date DESC NULLS LAST
         LIMIT 1) "out" ON true
  WHERE COALESCE(p.quantity, 0::numeric) > 0::numeric AND COALESCE((p.raw ->> 'IsFinished'::text)::boolean, false) = false;

-- The three dependents, restored verbatim. Recreated only because
-- v_stock_packages had to be dropped; not one character of their logic changes.
create view public.v_missing_lab_results as
 SELECT l.package_tag, l.product, l.category, l.strain, l.source_harvest, l.pounds,
    l.went_out_on, CURRENT_DATE - l.went_out_on AS days_missing, l.testing_state,
    round(l.pounds * f_rate_for(s.stream)) AS value_at_risk,
    s.location AS where_it_is_now, s.origin,
    ((((('Submitted to the laboratory on '::text || l.went_out_on) || ' and still showing '::text) || l.testing_state) || ' after '::text) || (CURRENT_DATE - l.went_out_on)) || ' days. No result has been recorded. Chase the laboratory for the certificate and enter it.'::text AS what_to_do
   FROM lab_turnaround_log l
     LEFT JOIN v_stock_packages s ON s.package_tag = l.package_tag
  WHERE l.came_back_on IS NULL AND (l.testing_state = ANY (ARRAY['SubmittedForTesting'::text, 'TestingInProgress'::text]))
  ORDER BY (CURRENT_DATE - l.went_out_on) DESC;

create view public.v_concentrate_valuation as
 SELECT s.package_tag, s.item_name, s.strain, s.pounds, round(s.quantity) AS grams,
    s.lab_state, s.location,
    COALESCE(m.sub_type, 'Crude, distillate or isolate'::text) AS sub_type,
    COALESCE(m.dollars_per_gram, round((( SELECT v_cost_of_goods.badder_crude_per_pound FROM v_cost_of_goods)) / 453.592, 4)) AS dollars_per_gram,
    round(s.pounds * f_concentrate_rate_per_lb(s.item_name)) AS value_at_cost,
    COALESCE(m.source, 'No sheet rate for this type. Falls back to the crude cost per gram computed '::text || 'by the Production Cost Calculator from the owner''s worksheet.'::text) AS rate_source
   FROM v_stock_packages s
     LEFT JOIN LATERAL ( SELECT m2.id, m2.match_pattern, m2.sub_type, m2.dollars_per_gram, m2.source, m2.sort
           FROM concentrate_rate_map m2 WHERE s.item_name ~~* m2.match_pattern ORDER BY m2.sort LIMIT 1) m ON true
  WHERE s.stream = 'Concentrate'::text;

create view public.v_stock_proof as
 SELECT s.package_tag, s.item_name, s.strain, s.stream, s.origin, s.made_by,
    s.shipped_to_us_by, s.license, s.location, s.days_here, s.packaged_on,
    s.quantity, s.uom, s.pounds, s.units, s.quantity_shown, s.sold_by_weight, s.lab_state,
        CASE s.lab_state
            WHEN 'TestPassed'::text THEN 'Sellable now'::text
            WHEN 'RetestPassed'::text THEN 'Sellable now'::text
            WHEN 'TestFailed'::text THEN 'Failed testing'::text
            WHEN 'RetestFailed'::text THEN 'Failed testing'::text
            WHEN 'NotSubmitted'::text THEN 'Never submitted'::text
            ELSE 'At the laboratory'::text
        END AS band,
    f_test_status(s.lab_state, s.submitted_on, s.result_on) AS test_status,
    s.submitted_on AS went_out_for_testing_on,
    s.result_on AS came_back_on,
        CASE
            WHEN s.result_on IS NOT NULL AND s.submitted_on IS NOT NULL THEN s.result_on - s.submitted_on
            WHEN s.submitted_on IS NOT NULL AND (s.lab_state = ANY (ARRAY['SubmittedForTesting'::text, 'TestingInProgress'::text])) THEN CURRENT_DATE - s.submitted_on
            ELSE NULL::integer
        END AS days_at_the_laboratory,
    s.coa_expires AS certificate_valid_to,
    lr.total_thc, lr.total_cbd, lr.total_terpenes, lr.laboratory, lr.coa_url,
    f_potency_status(lr.total_thc, lr.total_terpenes, s.lab_state) AS potency_and_certificate,
    s.inbound_manifest,
        CASE
            WHEN s.inbound_manifest IS NULL THEN 'NO MANIFEST — created here from our own harvest or another of our packages, so it never moved '::text || 'between licences. Manifests exist only for material that changed hands.'::text
            ELSE ('Manifest '::text || s.inbound_manifest) || COALESCE(' from '::text || NULLIF(s.shipped_to_us_by, '—'::text), ''::text)
        END AS manifest_proof,
    s.source_harvest, s.harvest_cut_on, s.dried_in, s.harvest_closed_on,
    s.made_from_packages, s.production_batch, s.traceability,
    f_rate_for(s.stream) AS rate_per_pound_used,
    round(COALESCE(s.pounds, 0::numeric) * f_rate_for(s.stream)) AS value_at_our_rate
   FROM v_stock_packages s
     LEFT JOIN LATERAL ( SELECT pi.package_tag, pi.item_name, pi.strain, pi.category,
            pi.license, pi.location, pi.quantity, pi.unit_of_measure, pi.pounds,
            pi.packaged_on, pi.cultivator_or_manufacturer, pi.maker_note, pi.maker_license,
            pi.origin, pi.received_from, pi.manifest_number, pi.manifest_url,
            pi.manifest_status, pi.lab_state, pi.submitted_on, pi.result_on, pi.coa_expires,
            pi.total_thc, pi.total_cbd, pi.total_terpenes, pi.analyte_count, pi.analyte_note,
            pi.coa_url, pi.laboratory, pi.coa_status
           FROM v_product_identity pi WHERE pi.package_tag = s.package_tag LIMIT 1) lr ON true;

commit;

-- ── 3 · restore the grants the drops removed ─────────────────────────────────
-- Deliberately NOT granting to anon. tools/checks/anon_exposure.sql is the
-- tripwire and this must not trip it.
grant select on public.v_stock_packages,
                public.v_stock_proof,
                public.v_concentrate_valuation,
                public.v_missing_lab_results,
                public.mv_tag_evidence
  to authenticated, service_role;

-- ── 4 · the guard, so a sixth definition cannot drift in unseen ──────────────
-- Routed through verification_checks because tg_verify() actually runs (cron
-- job verification-suite, '20 * * * *') and raises a watchdog_findings row.
-- This check is the reason the migration is worth applying at all: without it,
-- the next person to add a certificate view reintroduces the same defect and
-- nothing notices for a month.
insert into verification_checks
  (check_key, title, what_it_proves, source_a_label, source_a_sql,
   source_b_label, source_b_sql, tolerance_pct, severity, owner,
   measures_a_process, in_flight_rule, settles_within)
values
('certificate_one_definition_agrees',
 'Every definition of "this tag has a certificate" gives the same answer',
 'On 12 Aug 2026 five objects answered the question "do these 26 held packages have a '
 'certificate" and gave five different answers: 0, 0, 1, 15 and 19. The inventory '
 'surface said 0 while 16 certificates were already fetched, parsed and on disk. '
 'Owner ruling hold_the_ddc_discipline: count the definitions of any primitive, more '
 'than one is the defect. This compares the evidence surface against the resolver it '
 'is supposed to delegate to. It can only read zero while there is exactly one '
 'definition, which is the point.',
 'Held tags the evidence surface calls certified',
 'select count(*)::numeric from v_stock_packages where evidence_source in (''direct'',''certificate on file'',''inherited'',''inherited via Metrc'')',
 'Held tags the resolver calls certified',
 'select count(*)::numeric from v_stock_packages s join v_certificate_resolved r on r.package_tag = s.package_tag',
 0, 'critical', 'Agent P — Parser & Documents', false, null, null),

-- The negative half. Every defect this platform has recorded would have been
-- caught by the negative half alone, so it is written first and it must stay
-- quiet on a good day: it reads zero today and rises the moment a certificate
-- is claimed for a tag with no document behind it.
('certificate_never_claimed_without_a_document',
 'No tag is called certified without a document we actually hold',
 'mv_tag_certificate graded a bare Metrc lab result as a certificate — 4 of the 26 held '
 'packages, with certificate_document null on every one. A test having happened is not '
 'a certificate in hand, and a surface that conflates them tells a regulator we hold '
 'paperwork we do not hold. This counts any tag the evidence surface calls certified '
 'while no parsed certificate document backs it. Zero today; must stay zero.',
 'Tags called certified with no certificate document behind them',
 'select count(*)::numeric from v_stock_packages s where s.evidence_source in (''direct'',''certificate on file'',''inherited'',''inherited via Metrc'') and not exists (select 1 from v_certificate_resolved r join coa_extract c on c.document_id = r.certificate_document where r.package_tag = s.package_tag)',
 'Expected (zero)',
 'select 0::numeric',
 0, 'critical', 'Agent P — Parser & Documents', false, null, null),

-- The coverage counter. It compares against the SURFACE, not the resolver.
-- Written against the resolver first, it read 0 on the day it was registered —
-- because the resolver already had the bridge — and a check that cannot fail is
-- decoration. Against the surface it reads 14 today and falls to 0 when this
-- migration lands.
('certificate_surface_shows_every_certificate_held',
 'The inventory surface can show every certificate we actually hold',
 'Metrc names a certificate file for 1,904 tags. coa_extract stamps 969, because one '
 'certificate covers many tags — 431 cover more than one and one covers 24. The '
 'difference, 935 tags, held a fetched and parsed certificate that nothing joined to '
 'them, and on held stock the inventory surface reported "no certificate" for 14 tags '
 'whose certificate was on disk. coa_extract.package_tag is NOT the fix and must keep '
 'holding what the document printed; the join is metrc_lab_results.document_file_id.',
 'Held tags whose certificate is on disk but the surface will not show it',
 'select count(distinct l.package_tag)::numeric from metrc_lab_results l join coa_extract c on c.document_id = l.document_file_id join v_stock_packages s on s.package_tag = l.package_tag where s.evidence_source not in (''direct'',''certificate on file'',''inherited'',''inherited via Metrc'')',
 'Expected (zero)',
 'select 0::numeric',
 0, 'elevated', 'Agent P — Parser & Documents', false, null, null)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_label = excluded.source_a_label, source_a_sql = excluded.source_a_sql,
  source_b_label = excluded.source_b_label, source_b_sql = excluded.source_b_sql,
  tolerance_pct = excluded.tolerance_pct, severity = excluded.severity,
  owner = excluded.owner, measures_a_process = excluded.measures_a_process,
  in_flight_rule = excluded.in_flight_rule, settles_within = excluded.settles_within;

-- ── 5 · populate, and prove the numbers in the migration record ──────────────
refresh materialized view public.mv_tag_evidence;

select evidence_source, count(*) as tags, round(sum(pounds), 2) as lb
from v_stock_packages group by 1 order by 3 desc;
