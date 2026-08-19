/* RULE D CHALLENGED AND CORRECTED BEFORE IT EVER REACHED THE OWNER.
 *
 * First run flagged 14,636 of 18,980 packages (77%) as BROKEN TAG CHAIN. A
 * rule that fires on three quarters of the population is not finding gaps, it
 * is finding its own defect — the house rule is to challenge before
 * reporting, and the challenge held:
 *
 *   - only 4,856 packages have a PackagedDate in the mirror at all;
 *   - the other 14,124 arrived on the transfers report as INBOUND packages,
 *     created at another licensee. We were never the creator, so no 'packaged'
 *     event by us can exist. Demanding one is demanding a fact that never
 *     happened — the same error class as reading a child package one level
 *     deep and booking third-party material as our production.
 *   - 512 packages DO carry a creation date with no matching event. Those are
 *     a real ledger gap, and they are backfilled here from the mirror rather
 *     than reported 512 times.
 *
 * Rule D now fires only where the chain is genuinely dark: no events at all,
 * or a known creation date with no creation event (zero after this backfill).
 * Inbound packages are recognised by their received event and excluded with
 * the reason stated in the rule body. */

insert into public.tag_event (tag, event_at, event_type, stage, location, qty, uom, source, source_row)
select p.tag,
       p.packaged_on::timestamptz,
       'packaged',
       'Packaged',
       p.location,
       p.quantity,
       p.uom,
       'metrc_packages:backfill_19aug2026',
       jsonb_build_object(
         'why', 'Creation event reconstructed from the package mirror during the gap-engine build, '
             || '19 Aug 2026: the package carries a PackagedDate but the event ledger held no '
             || 'creation event, so its chain began mid-life.',
         'packaged_date', p.packaged_on,
         'licence', p.license)
from (select distinct on (d.tag) d.* from metrc_packages d
      order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
               (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p
where p.packaged_on is not null
  and not exists (select 1 from tag_event e where e.tag = p.tag and e.event_type = 'packaged');

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
         count(*) filter (where event_type='received')        as n_received,
         count(*) filter (where event_type='location_change') as n_moves
  from tag_event group by tag
),
stay_bad as (
  select tag,
         count(*) filter (where duration_hours < 0) as negative_stays,
         count(*) filter (where duration_hours = 0 and not is_current) as zero_stays
  from v_tag_stay group by tag
)
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
select s.package_tag, 'B', 'MANIFEST MISSING', 'critical',
       'This tag left the facility with no manifest recorded',
       'A transfer without a manifest is a compliance breach. Locate the Metrc manifest for this shipment and attach it.',
       null, null, s.pounds, td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from v_forensic_sold_by_tag s left join mv_tag_documents td on td.tag=s.package_tag
where s.manifest_number is null
union all
select s.package_tag, 'C', 'INVOICE MISSING', 'elevated',
       'Shipped as a sale with no Apex invoice matched',
       'Find the Apex invoice for this shipment and link it, or record why no invoice exists (sample, return, internal).',
       null, null, s.pounds, td.coa_document_link, td.manifest_document_link, null
from v_forensic_sold_by_tag s left join mv_tag_documents td on td.tag=s.package_tag
where s.invoice_match='NO APEX INVOICE' and not s.internal_transfer
union all
/* RULE D, CORRECTED. Dark chain only: no events whatsoever, or a known
   creation date with no creation event. A package we RECEIVED was created at
   another licensee — no creation event by us can exist, and demanding one
   manufactures a gap out of a fact that never happened. */
select l.tag, 'D', 'BROKEN TAG CHAIN', 'critical',
       case when e.tag is null then 'This package has NO event history at all — it exists in the mirror with no recorded life'
            else 'Metrc records a packaged date of ' || l.packaged_on || ' but the ledger holds no creation event' end,
       'Re-run the ledger build for this tag and compare against Metrc. A tag with no chain cannot be defended in an audit.',
       l.location, l.license, round(f_to_pounds(l.quantity,l.uom),3),
       td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from led l
left join ev e on e.tag=l.tag
left join mv_tag_documents td on td.tag=l.tag
where e.tag is null
   or (l.packaged_on is not null and e.n_packaged = 0)
union all
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
select b.tag, 'F', 'TIMESTAMP GAP', 'elevated',
       case when b.negative_stays > 0 then b.negative_stays || ' stay(s) end BEFORE they begin'
            else b.zero_stays || ' closed stay(s) of zero hours' end,
       'Event timestamps are out of order or duplicated. Re-import the movement events for this tag from the source report.',
       null, null, null, td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from stay_bad b left join mv_tag_documents td on td.tag=b.tag
where b.negative_stays > 0 or b.zero_stays > 0
union all
select v.package_tag, 'G', 'DOCUMENT MISMATCH', 'critical',
       'Certificate and lineage disagree on whose material this is: ' || left(v.verdict, 90),
       'The certificate is the independent source and wins. Re-attribute the package or explain the disagreement in writing.',
       null, null, v.pounds, td.coa_document_link, td.manifest_document_link, td.apex_invoice_no
from v_ownership_verdict v left join mv_tag_documents td on td.tag=v.package_tag
where v.verdict ilike 'CONFIRMED NOT OURS%';;
