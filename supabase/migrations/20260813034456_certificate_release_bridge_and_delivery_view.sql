-- Agent P (Parser & Documents), 12 August 2026. v3, after three review rounds with Agent X.
-- Applied by Agent I, 13 Aug 2026. Full rationale in the repo file of the same name.
--
-- WHAT IS BEING FIXED, unchanged and unchallenged across all three reviews:
--     distinct document_file_id in metrc_lab_results    983
--     doc_type='coa' rows in metrc_documents            983  (0 unmatched on metrc_id)
--     tags Metrc links to a certificate               1,904
--     tags coa_extract stamps                           969
--     tags holding a parsed certificate, unlinked       935
-- One certificate covers many tags (431 cover more than one, one covers 24).
-- coa_extract.package_tag holds WHAT THE DOCUMENT PRINTED and does not change.
-- The bridge has existed since 20260807235304 and no inventory surface consumed it.
--
-- THE FINDING THAT SHAPED v3: no front-end surface reads v_stock_packages.evidence_source.
-- dashkit.jsx:343 and wcanvas-data.js:370 both read mv_tag_evidence. So v2, applied as
-- approved, would have released 22.4 lb in the database and 0 lb on any screen while its own
-- fixture went green - the logged root cause "guards watched the database, not the screen"
-- reproducing. v3 therefore leads with the DELIVERY object.
--
-- BLOCKER 1 (X): v2's lateral searched coa_extract by package_tag, but the bridge population is
-- BY DEFINITION the set no coa_extract row names - 0 of 30 findable that way, 30 of 30 via
-- document_file_id. All 30 would have read certified with certificate_document NULL and
-- why_no_certificate forced NULL. Fixed: resolved through the bridge, and why_no_certificate is
-- nulled ONLY when a document is genuinely nameable.
--
-- BLOCKER 2 (X): 15 of the 30 resolve at depth 0, so nothing was inherited and
-- certificate_inherited_from is correctly NULL, while dashkit.jsx:417 interpolates it
-- unconditionally. Fixed at source: a depth-0 bridge tag is no longer called 'inherited'.
--
-- BLOCKER 4 (X, proved from the documents): 'direct' already means coa_extract.package_tag = tag,
-- the 969 documents that name their own tag. Of the 160 tags a 'direct' relabel would cover:
--     the PDF prints THIS tag        0
--     the PDF prints a DIFFERENT tag 7   (all held stock)
--     no readable tag              153
-- 1A40A01000013ED000020144 resolves to a certificate printing ...020490; ...020830 -> ...019375;
-- ...020835 and ...020836 -> ...019336. A fifth value costs nothing: the front end tests only
-- evidence_source === "inherited", in three places, and nothing tests "direct".
--
-- STILL NOT FIXED, disclosed rather than inherited silently:
--   * certificate_link in v_certificate_resolved reads 'DIRECT' for 1,904 tags, 935 rank 2.
--   * mv_tag_certificate and mv_tag_coa_lineage remain further definitions. Retiring them needs
--     the matview drop only the owner can authorise.
--   * The transfer-edge lineage upgrade stays cut: one tag for 2,798 -> 13,486 rows across eight
--     consumers. This releases 30, not 32.
--   * 7 of the 26 held packages (60.37 lb) need TG-01's re-queue; 3 more (2.61 lb) have an
--     ancestor result with document_file_id NULL and must come from the laboratory or Apex.
--   * coa_extract: pathogens 0/983, water_activity 0/983, self-test 20 against a threshold of 3.
--   * 15 certificates read client_name 'Zen MA' against our own MP281909, covering 119 held tags.
--     NO ownership column is shipped. Owner decision.
--
-- METRC IS READ-ONLY THROUGHOUT. No external call.
-- UNDO: drop view v_tag_evidence; restore v_stock_packages from git with CREATE OR REPLACE;
--       delete from verification_checks where check_key like 'certificate_%'.

create or replace view public.v_tag_evidence as
select
  e.tag,
  e.item_name,
  e.lab_testing_state,
  case
    when e.evidence_source in ('direct','inherited') then e.evidence_source
    when cr.package_tag is null                      then e.evidence_source
    when cr.found_at_depth = 0                       then 'certificate on file'
    else                                                  'inherited'
  end                                                                as evidence_source,
  coalesce(e.certificate_id,   b.lab_report_id)                      as certificate_id,
  coalesce(e.certificate_date, b.report_date)                        as certificate_date,
  coalesce(e.total_thc,        b.total_thc)                          as total_thc,
  case
    when e.certificate_inherited_from is not null then e.certificate_inherited_from
    when cr.found_at_depth > 0                    then cr.certificate_on_package
  end                                                                as certificate_inherited_from,
  coalesce(e.certificate_document, b.storage_path)                   as certificate_document,
  e.lab_result_date,
  e.lab_name,
  e.manifest_number,
  e.manifest_document,
  case
    when e.evidence_source in ('direct','inherited') then e.why_no_certificate
    when b.storage_path is not null                  then null::text
    else e.why_no_certificate
  end                                                                as why_no_certificate,
  e.why_no_manifest,
  case
    when exists (select 1 from coa_extract c where c.package_tag = e.tag)
      then 'direct — the certificate document names this tag'
    when e.certificate_inherited_from is not null
      then 'inherited — a parsed certificate names ancestor ' || e.certificate_inherited_from
    when cr.found_at_depth = 0 and b.printed_tag is not null and b.printed_tag <> e.tag
      then 'certificate on file — Metrc''s lab result for this tag names this certificate, and the document itself prints a DIFFERENT tag, ' || b.printed_tag || '. One certificate covers a whole batch; this tag is a member the document does not list by name.'
    when cr.found_at_depth = 0
      then 'certificate on file — Metrc''s lab result for this tag names this certificate; the document itself prints no tag we could read, so it does not name this package'
    when cr.found_at_depth > 0
      then 'inherited via Metrc — the lab result for ancestor ' || cr.certificate_on_package || ' names this certificate'
    when e.evidence_source = 'lab result only'
      then 'lab result only — Metrc holds the result and that laboratory attached no certificate document'
    else 'none — no certificate on this tag, its lineage, or any Metrc lab result'
  end                                                                as certificate_grade,
  cr.found_at_depth                                                  as certificate_hops,
  cr.cert_client                                                     as certificate_client,
  cr.cert_license                                                    as certificate_client_license
from mv_tag_evidence e
left join v_certificate_resolved cr on cr.package_tag = e.tag
left join lateral (
  select d.storage_path, c.lab_report_id, c.report_date, c.total_thc,
         c.package_tag_on_document as printed_tag
  from metrc_lab_results l
  join metrc_documents d on d.metrc_id = l.document_file_id and d.doc_type = 'coa'
  left join coa_extract c on c.document_id = l.document_file_id
  where l.package_tag = cr.certificate_on_package
    and l.document_file_id is not null
  limit 1) b on true;

comment on view public.v_tag_evidence is
  'Certificate and manifest evidence per tag — the object the front end should '
  'read INSTEAD of mv_tag_evidence. Columns 1-15 are a drop-in match for that '
  'matview so the repoint is a one-word change in dashkit.jsx and wcanvas-data.js. '
  'It exists because mv_tag_evidence inherits certificates through lineage but '
  'never consults metrc_lab_results.document_file_id, so 935 tags holding a '
  'fetched and parsed certificate read as having none. evidence_source moves '
  'upward only and now has FIVE values: the four original, plus "certificate on '
  'file" for a depth-0 bridge tag. That fifth value exists because "direct" '
  'already means the document names the tag — measured across the 160 such tags, '
  'NONE is named by its document and SEVEN are named by a certificate printing a '
  'different tag, so calling them direct would put two populations under one word. '
  '"inherited" always carries a non-null certificate_inherited_from, because a '
  'depth-0 bridge tag inherited nothing. certificate_grade carries the real basis, '
  'including the case where the certificate is genuine and the document does not '
  'print the tag. certificate_client is verbatim and carries NO ownership '
  'verdict: 15 certificates read Zen MA against our own MP281909.';

create or replace view public.v_stock_packages as
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
    ev.certificate_grade,
    ev.certificate_hops,
    ev.certificate_client,
    ev.certificate_client_license
   FROM metrc_packages p
     LEFT JOIN metrc_harvests h ON h.name = split_part(COALESCE(p.raw ->> 'SourceHarvestNames'::text, ''::text), ','::text, 1)
     LEFT JOIN v_tag_evidence ev ON ev.tag = p.tag
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

grant select on public.v_tag_evidence to authenticated, service_role, tg_desktop_reader;

insert into verification_checks
  (check_key, title, what_it_proves, source_a_label, source_a_sql,
   source_b_label, source_b_sql, tolerance_pct, severity, owner,
   measures_a_process, in_flight_rule, settles_within)
values
('certificate_surface_shows_every_certificate_held',
 'The inventory surface shows every certificate we actually hold',
 'COVERAGE COUNTER, not two independent derivations — the two sides share a predicate '
 'and this check cannot prove agreement. Metrc names a certificate file for 1,904 tags; '
 'coa_extract stamps 969, because one certificate covers many tags. 935 tags held a '
 'fetched and parsed certificate that nothing joined to them, and on held stock the '
 'surface reported no certificate for 15 tags whose certificate was already on disk. '
 'Owner ruling tested_means_a_coa_exists_go_find_it forbids reporting absence when the '
 'answer is ours to find.',
 'Held tags whose certificate is on disk but the surface will not show it',
 'select count(*)::numeric from v_stock_packages s where s.evidence_source not in (''direct'',''inherited'',''certificate on file'') and exists (select 1 from metrc_lab_results l join coa_extract c on c.document_id = l.document_file_id where l.package_tag = s.package_tag)',
 'Expected (zero)',
 'select 0::numeric',
 0, 'elevated', 'Agent P — Parser & Documents', false, null, null),

('certificate_never_claimed_without_a_nameable_document',
 'No package is called certified unless a certificate document can be named for it',
 'mv_tag_certificate grades a bare Metrc lab result as a certificate — 4 of the 26 held '
 'packages, certificate_document null on every one. A test having happened is not a '
 'certificate in hand, and a surface that conflates them tells a regulator we hold '
 'paperwork we do not hold. This asks whether a parsed certificate document can be NAMED '
 'by any route — on the tag, on the ancestor the surface cites, on the ancestor the '
 'resolver cites, or through a Metrc lab result on either. It does NOT test whether the '
 'view exposes that document; check certificate_surface_shows_every_certificate_held for '
 'that. Zero today and zero after, both measured 12 Aug 2026.',
 'Tags called certified with no nameable certificate document',
 'select count(*)::numeric from v_stock_packages s where s.evidence_source in (''direct'',''inherited'',''certificate on file'') and not exists (select 1 from coa_extract c where c.package_tag = s.package_tag) and not exists (select 1 from mv_tag_evidence e join coa_extract c on c.package_tag = e.certificate_inherited_from where e.tag = s.package_tag) and not exists (select 1 from metrc_lab_results l join coa_extract c on c.document_id = l.document_file_id where l.package_tag = s.package_tag) and not exists (select 1 from v_certificate_resolved r join coa_extract c on c.package_tag = r.certificate_on_package where r.package_tag = s.package_tag) and not exists (select 1 from v_certificate_resolved r join metrc_lab_results l on l.package_tag = r.certificate_on_package join coa_extract c on c.document_id = l.document_file_id where r.package_tag = s.package_tag)',
 'Expected (zero)',
 'select 0::numeric',
 0, 'critical', 'Agent P — Parser & Documents', false, null, null),

('certificate_certified_rows_carry_a_document_path',
 'Every certified package can actually open its certificate',
 'v2 of this work would have marked 30 packages certified with certificate_document NULL '
 'and why_no_certificate also NULL — certified in one column, unexplained blank in the '
 'next — because the document lookup searched coa_extract by package_tag and the bridge '
 'population is precisely the set no coa_extract row names: 0 of 30 findable that way, 30 '
 'of 30 findable through document_file_id. A release nobody can open is not a release. '
 'This is also the guard against the wider failure: releasing material in the database '
 'while every screen still reads "no certificate".',
 'Tags called certified with neither a document path nor a reason',
 'select count(*)::numeric from v_stock_packages where evidence_source in (''direct'',''inherited'',''certificate on file'') and certificate_document is null and why_no_certificate is null',
 'Expected (zero)',
 'select 0::numeric',
 0, 'critical', 'Agent P — Parser & Documents', false, null, null)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_label = excluded.source_a_label, source_a_sql = excluded.source_a_sql,
  source_b_label = excluded.source_b_label, source_b_sql = excluded.source_b_sql,
  tolerance_pct = excluded.tolerance_pct, severity = excluded.severity,
  owner = excluded.owner, measures_a_process = excluded.measures_a_process,
  in_flight_rule = excluded.in_flight_rule, settles_within = excluded.settles_within;;
