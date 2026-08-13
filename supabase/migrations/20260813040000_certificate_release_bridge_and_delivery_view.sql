-- Agent P (Parser & Documents), 12 August 2026. v3, after Agent X returned v2
-- as APPLY WITH CHANGES. v2 is superseded; v1 was already renamed out of the path.
--
-- X confirmed v2's arithmetic against live — 1,118 rows, no fan-out, 30 tags /
-- 22.40 lb, 0 downgrades, 966 existing values byte-identical — and then found
-- three defects and one thing that outranks all of them.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE ONE THAT OUTRANKS THE REST, and it changes what this migration IS.
--
-- NO FRONT-END SURFACE READS v_stock_packages.evidence_source. Verified:
--     app/web/src/dashkit.jsx:343       reads mv_tag_evidence
--     app/web/src/wcanvas-data.js:370   reads mv_tag_evidence
--     app/web/src/App.jsx:4630          reads v_stock_packages, uses no evidence column
--     v_stock_proof                     does not select evidence_source at all
--
-- So v2, applied exactly as approved, would have released 22.4 lb in the
-- database and 0 lb on any screen. All 30 packages would keep rendering "no
-- certificate" on every tile, drill and report while the positive fixture went
-- green. That is the logged root cause "guards watched the database, not the
-- screen" reproducing exactly, and I built it.
--
-- v3 therefore leads with the DELIVERY object: v_tag_evidence, a plain view that
-- is a drop-in superset of mv_tag_evidence — same fifteen columns, same names,
-- same types, same order — with the bridge applied. The front-end change is a
-- one-word repoint in two files. No matview is dropped, so guard E1 is not
-- involved. I have NOT touched any front-end file; Agent B owns that repoint.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCKER 1 — v2 would have shipped "certified" with a blank where the document
-- goes. My crd lateral looked for coa_extract WHERE package_tag =
-- certificate_on_package, but the bridge population is BY DEFINITION the set no
-- coa_extract row names. Measured on the 30:
--     findable by v2's lateral                      0 of 30
--     findable via document_file_id -> metrc_id    30 of 30
-- All 30 would have landed with certificate_document NULL, certificate_id NULL,
-- and why_no_certificate forced NULL by my own CASE — certified in one column,
-- unexplained blank in the next. A3 and substantiation-or-nothing. Fixed below:
-- the document is resolved through the bridge, and why_no_certificate is nulled
-- ONLY when a document is actually nameable.
--
-- BLOCKER 2 — "Certificate (inherited from null)". 15 of the 30 resolve at
-- found_at_depth = 0: the certificate is on the tag itself via Metrc's lab
-- result, so nothing was inherited and certificate_inherited_from is correctly
-- NULL. dashkit.jsx:417 interpolates that field unconditionally.
-- Fixed at the source rather than defensively: a depth-0 bridge tag is no longer
-- called 'inherited'. Measured split of the 30 — depth 0: 15, none with an
-- ancestor; depth 1: 15, all with a real ancestor. So 'inherited' now implies a
-- non-null ancestor by construction and the null cannot be reached.
--
-- BLOCKER 4 — and this one X proved from the documents themselves, against my
-- own proposal. My first fix routed depth-0 bridge tags to 'direct'. I argued
-- that was defensible because Metrc is the legal record. It is not defensible,
-- because 'direct' ALREADY means something precise here — coa_extract.package_tag
-- = tag, the 969 documents that name their own tag. Of the 160 tags that
-- relabelling would have covered:
--     the PDF prints THIS tag                    0
--     the PDF prints a DIFFERENT tag             7   (all held stock)
--     the PDF printed no readable tag          153
-- Not one document names its tag, and seven name someone else outright —
-- 1A40A01000013ED000020144 resolves to a certificate printing ...020490;
-- ...020830 -> ...019375; ...020835 and ...020836 -> ...019336. Merging those
-- into 'direct' is two definitions under one label: hold_the_ddc_discipline and
-- classification_presentation. And certificate_grade, which says it honestly,
-- renders nowhere — so the distinction would be invisible precisely when someone
-- quotes "direct" to an inspector.
-- A fifth value, 'certificate on file', costs nothing: the front end tests only
-- evidence_source === "inherited", in three places, and nothing tests "direct".
-- A fifth value falls to the same else-branch and renders identically —
-- "Certificate of Analysis" with a working link. The LINK was never in dispute;
-- the LABEL was the defect.
-- Where the printed tag is known and differs, certificate_grade now names it.
--
-- BLOCKER 3 — the fixtures. The independence claim on the positive half was
-- false: side B's predicate is byte-for-byte the rank-2 branch inside
-- v_certificate_resolved. Claim struck; it is a coverage counter and is labelled
-- one. The negative half is retitled to say what it actually measures.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS BEING FIXED, unchanged and unchallenged across all three reviews.
--     distinct document_file_id in metrc_lab_results    983
--     doc_type='coa' rows in metrc_documents            983
--     matching on metrc_id                              983   (0 unmatched)
--     tags Metrc links to a certificate               1,904
--     tags coa_extract stamps                           969
--     tags holding a parsed certificate, unlinked       935
-- One certificate covers many tags (431 cover more than one, one covers 24).
-- coa_extract.package_tag holds WHAT THE DOCUMENT PRINTED and does not change.
--
-- STILL NOT FIXED, disclosed rather than inherited silently:
--   * certificate_link in v_certificate_resolved reads 'DIRECT' for 1,904 tags,
--     935 of them rank 2. Pre-existing, eight consumers, not touched here.
--   * mv_tag_certificate and mv_tag_coa_lineage remain as further definitions,
--     still disagreeing (0 / 1 / 15 / 19 on the same 26 tags). Retiring them
--     needs the matview drop only the owner can authorise.
--   * The transfer-edge lineage upgrade stays cut. It buys one tag
--     (1A40A030000E5B2000011010, 0.996 lb) for 2,798 -> 13,486 rows across eight
--     consumers. Filed separately. This releases 30, not 32.
--   * 7 of the 26 held packages (60.37 lb) need TG-01's re-queue; 3 more
--     (2.61 lb) have an ancestor result with document_file_id NULL and must come
--     from the laboratory or Apex.
--   * coa_extract: pathogens 0/983, water_activity 0/983, pages 0/983,
--     client_address 0/983, self-test 20 against a threshold of 3. Not relaxed.
--   * 15 certificates read client_name 'Zen MA' against our own MP281909,
--     covering 119 held tags. NO ownership column is shipped. Owner decision.
--
-- METRC IS READ-ONLY THROUGHOUT. No external call.
--
-- UNDO: drop view v_tag_evidence (plain view, guard escape applies); restore
-- v_stock_packages from git with CREATE OR REPLACE; delete from
-- verification_checks where check_key like 'certificate_%'.

-- ── 1 · THE DELIVERY OBJECT ──────────────────────────────────────────────────
-- Drop-in superset of mv_tag_evidence. Columns 1-15 are identical in name, type
-- and order, so `supabase.from("mv_tag_evidence")` becomes
-- `supabase.from("v_tag_evidence")` and nothing else in the front end moves.
-- The matview is READ, not replaced: manifest resolution, item name and lab
-- state pass through untouched, and only the certificate answer is corrected.
-- This is the ONLY place the bridge is implemented; v_stock_packages consumes
-- this view rather than repeating it.
create or replace view public.v_tag_evidence as
select
  e.tag,
  e.item_name,
  e.lab_testing_state,
  -- FIVE values. 'direct' keeps its existing meaning and gains nothing:
  -- coa_extract.package_tag = tag, the 969 documents that name their own tag.
  -- A depth-0 bridge tag gets its own value because the document does NOT name
  -- it — measured on the 160 such tags: 0 print this tag, 7 print a DIFFERENT
  -- one, 153 print no readable tag. Movement is still upward only, and
  -- 'inherited' still implies a non-null ancestor by construction (blocker 2).
  -- Costs nothing on screen: the front end tests only "inherited", in three
  -- places, so a fifth value falls to the same else-branch and renders as
  -- "Certificate of Analysis" with a working link.
  case
    when e.evidence_source in ('direct','inherited') then e.evidence_source
    when cr.package_tag is null                      then e.evidence_source
    when cr.found_at_depth = 0                       then 'certificate on file'
    else                                                  'inherited'
  end                                                                as evidence_source,
  coalesce(e.certificate_id,   b.lab_report_id)                      as certificate_id,
  coalesce(e.certificate_date, b.report_date)                        as certificate_date,
  coalesce(e.total_thc,        b.total_thc)                          as total_thc,
  -- never a null interpolated into "inherited from …": non-null exactly when
  -- the branch above says 'inherited' via the bridge.
  case
    when e.certificate_inherited_from is not null then e.certificate_inherited_from
    when cr.found_at_depth > 0                    then cr.certificate_on_package
  end                                                                as certificate_inherited_from,
  coalesce(e.certificate_document, b.storage_path)                   as certificate_document,
  e.lab_result_date,
  e.lab_name,
  e.manifest_number,
  e.manifest_document,
  -- nulled ONLY when a document is genuinely nameable (blocker 1)
  case
    when e.evidence_source in ('direct','inherited') then e.why_no_certificate
    when b.storage_path is not null                  then null::text
    else e.why_no_certificate
  end                                                                as why_no_certificate,
  e.why_no_manifest,
  -- ── appended; columns 1-15 above are the matview's contract ──
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
-- THE BRIDGE, resolved the only way it can be: Metrc's lab result names the
-- certificate file, and metrc_documents holds it under that same id. Looked up
-- on the resolved tag, which is the tag itself at depth 0 and the ancestor above.
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

-- ── 2 · the inventory surface consumes the same object ───────────────────────
-- CREATE OR REPLACE: no drop, so every dependent and every grant survives,
-- including tg_desktop_reader's SELECT. Existing columns keep name, type and
-- ordinal position; four are appended. The only change is that ev is now
-- v_tag_evidence, so the bridge has exactly one implementation.
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

-- ── 3 · grants for the new view only ─────────────────────────────────────────
-- v_stock_packages was never dropped, so its grants are intact and are not
-- re-issued here. Deliberately NOT granting to anon.
grant select on public.v_tag_evidence to authenticated, service_role, tg_desktop_reader;

-- ── 4 · the fixture, both halves, each executed against live before writing ──
insert into verification_checks
  (check_key, title, what_it_proves, source_a_label, source_a_sql,
   source_b_label, source_b_sql, tolerance_pct, severity, owner,
   measures_a_process, in_flight_rule, settles_within)
values
-- COVERAGE COUNTER, not an independent derivation. The claim that the two sides
-- were written by different code paths was FALSE and is struck: side B's
-- predicate is byte-for-byte the rank-2 branch inside v_certificate_resolved,
-- and after this migration side A's exclusion is implied by side B. It is kept
-- because it counts real material that real people cannot see, and it must fall
-- to zero. It is not evidence of agreement.
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

-- NEGATIVE HALF, retitled to what it actually measures: whether a certificate
-- document can be NAMED, not whether the surface exposes one. Reads 0 today and
-- 0 after, both executed. Evidence that it CAN fail is two earlier drafts of
-- this same predicate that read 305 and 15 — not the shipped SQL, which has
-- never fired.
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

-- THE ONE THAT WOULD HAVE CAUGHT THE REAL DEFECT. A certificate that is
-- released in the database and invisible on screen has not been released. This
-- counts tags the surface calls certified while carrying no document path for a
-- reader to open. Reads 0 after; would have read 30 under v2.
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
  in_flight_rule = excluded.in_flight_rule, settles_within = excluded.settles_within;

-- ── 5 · prove it in the migration record ─────────────────────────────────────
-- No refresh: mv_tag_evidence is untouched and both new objects are plain views.
--
-- EXECUTED against live 12 Aug 2026 before this file was written — both bodies
-- run verbatim as SELECTs, not reasoned about. v1's failure was reporting
-- figures for SQL that did not parse, so these are measurements:
--
--   v_tag_evidence rows            4,553   = mv_tag_evidence 4,553, no fan-out
--   'inherited' with null ancestor     0   (blocker 2 closed)
--   existing direct/inherited changed  0
--   downgrades                         0
--   certified with blank + no reason   0   (blocker 1 closed; would be 30 under v2)
--   certified with no document at all  0
--
--   SCOPE OF CHANGE IS 182 TAGS, NOT 30. The front end reads v_tag_evidence for
--   shipped and finished tags too, and 182 rows change evidence_source
--   platform-wide. 30 of them are held stock; the other 152 are material that has
--   already left. Stating only the held figure understated the blast radius.
--
--   v_stock_packages, 1,118 tags / 2,459.46 lb:
--     before  direct 166 · inherited 800 · lab result only 30 · none 122
--     after   direct 166 · inherited 815 · certificate on file 15 ·
--             lab result only 15 · none 107
--     'direct' is unchanged at 166 — that is the point of blocker 4.
--     transitions, and there are only two:
--       lab result only -> certificate on file  15 tags  17.90 lb  15/15 open a document
--       none            -> inherited            15 tags   4.50 lb  15/15 open a document
--
--   RELEASED WEIGHT, with its basis, because the two figures in circulation are
--   both right and differ by rounding, not by data:
--       22.41 lb  exact pounds summed, rounded once  <- use this one
--       22.40 lb  the surface's own per-tag rounded column summed (22.403)
--   All 996 certified tags carry a document path, 0 exceptions.
select evidence_source, count(*) as tags, round(sum(pounds), 2) as lb,
       count(*) filter (where certificate_document is not null) as can_open_the_document
from v_stock_packages group by 1 order by 3 desc;
