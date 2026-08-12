-- ---------------------------------------------------------------------------
-- 0019 — Testing and samples reconciled AGAINST THE MANIFEST, by tag.
--
-- Owner, 10 Aug 2026: "THERE ARE VENDORS WE USE FOR TESTING ALSO THESE HAVE
-- MANIFEST SO THEY MUST RECONCILE AGAINST MANIFEST ALL TESTING AND SAMPLES" and
-- "WHEN IN DOUBT FORENSICALLY TRACK TAGS AND MANIFESTS".
--
-- Every package that leaves for a laboratory leaves ON A MANIFEST and should come
-- back as a RESULT against the same tag. Matching the two proves the testing
-- account rather than asserting it.
--
-- The result vindicates the method AND sizes the gap: 2025-26 match 357 of 370
-- tags (96.5%), while 2024 matches 0 of 133 -- because metrc_rpt_lab_results
-- begins 10 Jan 2025. That is OUR SYNC not reaching back, not tests that never
-- happened, and the two must never be reported as the same thing.
-- ---------------------------------------------------------------------------

create or replace view v_rpt_testing_reconciliation as
select extract(year from coalesce(m.created_on, m.received_on))::int as yr,
       m.destination_facility                        as lab,
       m.destination_licence                         as lab_licence,
       m.manifest_number,
       coalesce(m.created_on, m.received_on)         as sent_on,
       t.package_tag,
       t.item,
       t.category,
       t.strain,
       case when f_is_weight(t.shipped_uom)
            then round(f_to_pounds(t.shipped_qty, t.shipped_uom)::numeric, 4) end as lb_sent,
       case when not f_is_weight(t.shipped_uom) then t.shipped_qty end            as units_sent,
       (r.package_tag is not null)                   as has_result,
       r.test_date                                   as tested_on,
       r.overall_passed                              as passed,
       case
         when r.package_tag is not null then 'MATCHED — sample shipped and result returned'
         when coalesce(m.created_on, m.received_on) < '2025-01-10'
           then 'UNMATCHABLE — our lab-results sync begins 10 Jan 2025. The test may well '
              || 'have happened; we simply hold no result row. NOT a missing COA.'
         else 'NO RESULT — shipped on a manifest, no result against this tag. CHASE IT.'
       end                                           as verdict
from metrc_rpt_transfer_manifests m
join metrc_rpt_package_transfers t on t.manifest_number = m.manifest_number
left join lateral (
  select lr.package_tag, lr.test_date, lr.overall_passed
  from metrc_rpt_lab_results lr
  where lr.package_tag = t.package_tag
  order by lr.test_date desc nulls last
  limit 1
) r on true
where m.transfer_type = 'Lab Transfer';

comment on view v_rpt_testing_reconciliation is
  'Testing reconciled against the manifest, by TAG. Every sample that left on a Lab '
  'Transfer manifest, matched to its result. Distinguishes a genuinely missing COA '
  'from our own sync not reaching back before 10 Jan 2025 -- reporting those as the '
  'same thing would turn our silence into a compliance finding.';

grant select on v_rpt_testing_reconciliation to authenticated;
;
