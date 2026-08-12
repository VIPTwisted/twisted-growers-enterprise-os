-- Owner, 11 Aug 2026: "you have every metrc report - pull from it."
--
-- He was right and I had used TWO of TWELVE. The ledger was built from
-- metrc_packages and metrc_rpt_package_transfers only, which is why it could not
-- answer "days in every location" - the location history is in a report I had not
-- opened. ~98,000 rows of Metrc report data exist; the ledger was reading 23,608.
--
-- ADDED HERE, the two that carry what was actually asked for:
--   metrc_rpt_point_in_time  7,266 rows - tag + LOCATION + SUBLOCATION + as_of_date.
--                            This IS the location history. Each snapshot is a dated
--                            observation of where a tag was, so consecutive snapshots
--                            give days-in-location directly.
--   metrc_rpt_lab_results   39,531 rows - tag + test_date + lab licence and facility.
--                            The real testing clock. coa_extract gave 740 events;
--                            this is the full record, and it names the LAB, which is
--                            the licensed entity the compliance rule requires.

-- 1. LOCATION SNAPSHOTS. One event per tag per dated snapshot where the location
--    actually CHANGED - storing every identical snapshot would bury the movements in
--    noise and make "days here" meaningless.
insert into public.tag_event (tag, event_at, event_type, stage, location, source, source_row, attribution_source)
select tag, event_at, 'location_change', 'in inventory', loc, 'metrc_rpt_point_in_time', src, 'metrc'
from (
  select p.tag,
         p.as_of_date::timestamptz                                as event_at,
         nullif(trim(coalesce(p.location,'') ||
                case when nullif(trim(coalesce(p.sublocation,'')),'') is not null
                     then ' / ' || trim(p.sublocation) else '' end), '') as loc,
         p.source_row::text                                       as src,
         lag(nullif(trim(coalesce(p.location,'') ||
                case when nullif(trim(coalesce(p.sublocation,'')),'') is not null
                     then ' / ' || trim(p.sublocation) else '' end), ''))
           over (partition by p.tag order by p.as_of_date)         as prev_loc
  from public.metrc_rpt_point_in_time p
  where p.tag is not null and p.as_of_date is not null
) x
where loc is not null
  and (prev_loc is null or prev_loc is distinct from loc)
on conflict do nothing;

-- 2. LAB RESULTS. test_date is when the test was performed. One event per tag per
--    test date - lab_results holds one ROW PER ANALYTE (39,531 rows across 739
--    batches), so without the distinct a single test would land dozens of events and
--    every dwell calculation downstream would be wrong.
insert into public.tag_event (tag, event_at, event_type, stage, counterparty_licence,
                              source, source_row, attribution_source)
select distinct on (l.package_tag, l.test_date::date)
       l.package_tag, l.test_date::timestamptz, 'tested', 'tested',
       l.lab_licence, 'metrc_rpt_lab_results', l.source_row::text, 'metrc'
from public.metrc_rpt_lab_results l
where l.package_tag is not null and l.test_date is not null
order by l.package_tag, l.test_date::date, l.source_row
on conflict do nothing;

-- 3. ATTRIBUTION from the lab report. packaged_facility/packaged_licence name the
--    entity that PACKAGED the material - exactly the licensed party the owner
--    requires on every tag, and it comes from Metrc rather than from an assumption.
update public.tag_event e
set packager_licence = l.packaged_licence,
    packager_name    = l.packaged_facility,
    attribution_source = 'metrc lab report'
from (
  select distinct on (package_tag) package_tag, packaged_licence, packaged_facility
  from public.metrc_rpt_lab_results
  where package_tag is not null and nullif(trim(coalesce(packaged_facility,'')),'') is not null
  order by package_tag, test_date desc nulls last
) l
where e.tag = l.package_tag and e.packager_licence is null;

select event_type, count(*) events, count(distinct tag) tags
from public.tag_event group by event_type order by 2 desc;;
