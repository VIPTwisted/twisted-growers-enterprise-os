/* THE GAP-DETECTION ENGINE — owner architecture, 19 Aug 2026, rules A to G.
 *
 * "The module that continuously scans for missing manifests, missing COAs,
 * missing invoices, broken tag chains, missing timestamps, location gaps,
 * stage gaps, METRC mismatches." One view, one row per gap, every row naming
 * the tag, the rule, the severity, the required action and its documents —
 * so the gap dashboard IS a drill target like everything else.
 *
 * Each rule is a separate branch with its own WHY, so a false positive can be
 * killed at its own rule without touching the other six. Populations are
 * stated in each branch's comment because a gap count without a denominator
 * is a number nobody can act on.
 *
 * DETECTION ONLY. The owner's Gates 1-5 (block the transfer, block the sale)
 * are write-path enforcement and land next — this engine is what tells us
 * what the gates would have caught, on the 2.5 years of history that predate
 * them. */

create or replace view public.v_tag_gap as
with led as (
  select p.tag, p.item_name, p.license, p.location, p.quantity, p.uom, p.packaged_on,
         p.lab_testing_state, p.finished, p.raw,
         coalesce(p.raw #>> '{Item,ProductCategoryName}','(uncategorised)') as category,
         (coalesce(p.finished,false) or nullif(p.raw->>'FinishedDate','') is not null
          or nullif(p.raw->>'ArchivedDate','') is not null) as is_closed,
         (coalesce(p.quantity,0) > 0 and not coalesce(p.finished,false)) as is_live
  from (select distinct on (d.tag) d.* from metrc_packages d
        order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                 (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p
),
ev as (
  select tag,
         count(*) as n_events,
         count(*) filter (where event_type='packaged')        as n_packaged,
         count(*) filter (where event_type='location_change') as n_moves,
         count(*) filter (where event_type='tested')          as n_tested,
         min(event_at) as first_event, max(event_at) as last_event
  from tag_event group by tag
),
stay_bad as (
  select tag,
         count(*) filter (where duration_hours < 0) as negative_stays,
         count(*) filter (where duration_hours = 0 and not is_current) as zero_stays
  from v_tag_stay group by tag
)
/* RULE A — sellable-stage package with no COA. Population: live packages. */
select l.tag, 'A'::text as rule_code, 'COA MISSING'::text as gap_type,
       case when l.lab_testing_state='TestPassed' then 'critical' else 'elevated' end as severity,
       'Package is at package stage with no certificate in its lineage'::text as what_is_wrong,
       case when l.lab_testing_state='TestPassed'
            then 'PASSED testing but no COA document is held — it cannot be evidenced as sellable. Locate the certificate and attach it, or re-submit.'
            else 'No COA document held. Submit for testing or attach the certificate before this can be sold.' end as required_action,
       l.location as room, l.license as licence, round(f_to_pounds(l.quantity,l.uom),3) as lb,
       td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from led l left join mv_tag_documents td on td.tag=l.tag
where l.is_live and td.coa_document_link is null
union all
/* RULE B — shipped with no manifest. Population: outbound shipped lines. */
select s.package_tag, 'B', 'MANIFEST MISSING', 'critical',
       'This tag left the facility with no manifest recorded',
       'A transfer without a manifest is a compliance breach. Locate the Metrc manifest for this shipment and attach it.',
       null, null, s.pounds, td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from v_forensic_sold_by_tag s left join mv_tag_documents td on td.tag=s.package_tag
where s.manifest_number is null
union all
/* RULE C — sold with no invoice. Population: real outbound sales (internal
   moves, labs and transporters excluded by the sales-gap rules). */
select s.package_tag, 'C', 'INVOICE MISSING', 'elevated',
       'Shipped as a sale with no Apex invoice matched',
       'Find the Apex invoice for this shipment and link it, or record why no invoice exists (sample, return, internal).',
       null, null, s.pounds, td.coa_document_link, td.manifest_document_link, null
from v_forensic_sold_by_tag s left join mv_tag_documents td on td.tag=s.package_tag
where s.invoice_match='NO APEX INVOICE' and not s.internal_transfer
union all
/* RULE D — broken chain: a package that exists with NO event history at all,
   or with no creation event. Population: all packages. */
select l.tag, 'D', 'BROKEN TAG CHAIN', 'critical',
       case when e.tag is null then 'This package has NO event history — it exists in the mirror with no recorded life'
            else 'This package has events but no creation (packaged) event' end,
       'Re-run the ledger build for this tag and compare against Metrc. A tag with no chain cannot be defended in an audit.',
       l.location, l.license, round(f_to_pounds(l.quantity,l.uom),3),
       td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from led l
left join ev e on e.tag=l.tag
left join mv_tag_documents td on td.tag=l.tag
where e.tag is null or e.n_packaged = 0
union all
/* RULE E — location gap: the package sits in a room the event log never
   recorded it moving into. Population: live packages with a room. */
select l.tag, 'E', 'LOCATION GAP', 'elevated',
       'Metrc shows this package in ' || l.location || ' but no movement event records it arriving there',
       'A missing movement breaks the room history. Re-sync locations for this tag; if Metrc has no move either, the physical move was never recorded.',
       l.location, l.license, round(f_to_pounds(l.quantity,l.uom),3),
       td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from led l
left join ev e on e.tag=l.tag
left join mv_tag_documents td on td.tag=l.tag
where l.is_live and coalesce(l.location,'') <> ''
  and coalesce(e.n_moves,0) = 0
  and not exists (select 1 from v_tag_stay st where st.tag=l.tag and st.room = l.location)
union all
/* RULE F — timestamp gap: a stay with negative or impossible duration.
   Population: tags with any stay. */
select b.tag, 'F', 'TIMESTAMP GAP', 'elevated',
       case when b.negative_stays > 0 then b.negative_stays || ' stay(s) end BEFORE they begin'
            else b.zero_stays || ' closed stay(s) of zero hours' end,
       'Event timestamps are out of order or duplicated. Re-import the movement events for this tag from the source report.',
       null, null, null, td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from stay_bad b left join mv_tag_documents td on td.tag=b.tag
where b.negative_stays > 0 or b.zero_stays > 0
union all
/* RULE G — document mismatch: the certificate in the lineage names a
   different licensee than the package claims. Population: tags with a
   resolved certificate and a lineage verdict. */
select v.package_tag, 'G', 'DOCUMENT MISMATCH', 'critical',
       'Certificate and lineage disagree on whose material this is: ' || left(v.verdict, 90),
       'The certificate is the independent source and wins. Re-attribute the package or explain the disagreement in writing.',
       null, null, v.pounds, td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from v_ownership_verdict v left join mv_tag_documents td on td.tag=v.package_tag
where v.verdict ilike 'CONFIRMED NOT OURS%';

comment on view public.v_tag_gap is
  'THE GAP-DETECTION ENGINE, owner architecture 19 Aug 2026: one row per detected compliance gap '
  'across rules A (COA missing), B (manifest missing), C (invoice missing), D (broken tag chain), '
  'E (location gap), F (timestamp gap), G (document mismatch). Every row names the tag, the rule, '
  'the severity, the required action and its documents, so the gap dashboard drills like every '
  'other surface. Detection only — the write-path gates that BLOCK a transfer or sale are '
  'separate. Agent I.';

create or replace view public.v_tag_gap_summary as
select rule_code, gap_type, severity, count(*) as gaps,
       count(distinct tag) as tags, round(sum(coalesce(lb,0)),1) as lb_at_stake,
       max(required_action) as required_action
from v_tag_gap group by 1,2,3 order by 1;

comment on view public.v_tag_gap_summary is
  'The gap dashboard headline: gaps by rule with tags and pounds at stake. Each row drills to '
  'v_tag_gap filtered by rule_code, and from there to the tag. Agent I.';

grant select on public.v_tag_gap, public.v_tag_gap_summary to authenticated;;
