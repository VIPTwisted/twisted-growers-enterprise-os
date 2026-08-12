-- ---------------------------------------------------------------------------
-- 0030 — Which source covers which period, per domain.
--
-- Owner, 10 Aug 2026: "WHATEVER IS MISSING PRIOR TO DATES WE WILL PULL FROM OTHER
-- REPORTS AND METRC TO FILL IN ALL DATES. SOME METRC REPORTS DON'T ALLOW US TO GO
-- BACK FAR ENOUGH."
--
-- That strategy works, and this measures how well. Reports have DIFFERENT
-- retention windows, so one fills another's gap:
--
--   TESTING   metrc_rpt_lab_results reaches only 2025-01-10.
--             metrc_rpt_test_batches reaches 2024-06-04 -- SEVEN MONTHS FURTHER.
--             The new MC281714 Lab Results export adds 2024-10-01 onward.
--             Combined, testing is covered from 4 June 2024.
--
--   PACKAGES  the API mirror reaches 2023-10-09 -- further back than any report,
--             and it is the opening-stock evidence for 1 Jan 2024.
--
-- AND THE GAP THAT REMAINS DOES NOT MATTER. Testing is uncovered before 4 June
-- 2024, but the earliest harvest in Metrc is 15 MAY 2024 and the first package was
-- made 29 May 2024. There was almost nothing to test before June. The apparent
-- hole is the company not yet producing, not data lost to a retention window.
-- ---------------------------------------------------------------------------

create or replace view v_source_coverage as
with s as (
  select 'packages'::text as domain, 'metrc_packages (API mirror)'::text as source,
         min((raw->>'PackagedDate')::date) as earliest, max((raw->>'PackagedDate')::date) as latest,
         count(*)::bigint as rows, true as is_primary
  from metrc_packages where (raw->>'PackagedDate')::date is not null
  union all
  select 'harvests','metrc_harvests (API mirror)',
         min((raw->>'HarvestStartDate')::date), max((raw->>'HarvestStartDate')::date), count(*), true
  from metrc_harvests
  union all
  select 'harvest moisture','metrc_rpt_harvest_moisture',
         min(finished_on), max(finished_on), count(*), true from metrc_rpt_harvest_moisture
  union all
  select 'testing','metrc_rpt_lab_results',
         min(test_date), max(test_date), count(*), true from metrc_rpt_lab_results
  union all
  select 'testing','metrc_rpt_test_batches',
         min(test_date), max(test_date), count(*), false from metrc_rpt_test_batches
  union all
  select 'transfers','metrc_rpt_package_transfers',
         min(received_on), max(received_on), count(*), true from metrc_rpt_package_transfers
  union all
  select 'manifests','metrc_rpt_transfer_manifests',
         min(coalesce(created_on,received_on)), max(coalesce(created_on,received_on)), count(*), true
  from metrc_rpt_transfer_manifests
  union all
  select 'destruction','metrc_rpt_plants_destroyed',
         min(phase_date), max(phase_date), count(*), true from metrc_rpt_plants_destroyed
  union all
  select 'waste','metrc_rpt_plant_waste',
         min(waste_date), max(waste_date), count(*), true from metrc_rpt_plant_waste
  union all
  select 'adjustments','metrc_rpt_adjustments',
         min(adjusted_on), max(adjusted_on), count(*), true from metrc_rpt_adjustments
  union all
  select 'sales','apex_raw shipping-orders',
         min((payload->>'order_date')::date), max((payload->>'order_date')::date), count(*), true
  from apex_raw where entity='shipping-orders' and (payload->>'order_date') is not null
)
select domain, source, earliest, latest, rows, is_primary,
       min(earliest) over (partition by domain)                    as domain_earliest,
       earliest - min(earliest) over (partition by domain)          as days_behind_best,
       case when earliest = min(earliest) over (partition by domain)
            then 'DEEPEST SOURCE for this domain — use it to fill the others'
            else 'shallower — ' || (earliest - min(earliest) over (partition by domain))
                 || ' days later than the deepest source' end       as role
from s;

comment on view v_source_coverage is
  'How far back each source reaches, per domain. Reports have DIFFERENT retention '
  'windows, so the deepest source fills the others'' gaps -- test_batches reaches '
  'seven months further back than lab_results, and the package API mirror reaches '
  'further than any report. Read this before concluding a period has no data.';

grant select on v_source_coverage to authenticated;

insert into brain_fact (fact_key, fact, because, source_sql, learned_from) values
('metrc-reports-age-out-on-a-rolling-window',
 'METRC REPORTS EXPIRE. Owner: "SOME REPORTS DO NOT ALLOW US TO GO BACK MORE THAN 700 AND SOMETHING DAYS." MEASURED: the MC281714 Lab Results export pulled 10 Aug 2026 starts 1 Sep 2024 = 708 days. The window ROLLS FORWARD DAILY and no error is raised -- the report simply returns a shorter range and looks normal.',
 'History is being lost silently and permanently. Anything read as "a data gap" must first be tested against the retention window, and any report still reaching 2024 must be archived NOW. docs/metrc-exports and source_export are no longer a convenience; for expiring periods they are the only surviving copy. Retention is UNKNOWN on 10 of 13 catalogued reports and must be measured, not assumed.',
 'select * from v_report_retention_risk order by risk',
 'owner (Vinny), 10 Aug 2026'),
('fill-gaps-from-the-deepest-source-per-domain',
 'REPORTS COVER EACH OTHER. For TESTING, metrc_rpt_lab_results reaches only 2025-01-10 but metrc_rpt_test_batches reaches 2024-06-04 -- seven months further -- and the MC281714 Lab Results export adds 2024-10-01 onward. For PACKAGES the API mirror reaches 2023-10-09, deeper than any report. Check v_source_coverage before declaring a period empty.',
 'The remaining testing gap before 4 June 2024 does NOT matter: the earliest harvest in Metrc is 15 May 2024 and the first package was made 29 May 2024. There was almost nothing to test before June. That hole is the company not yet producing, not data lost to a window.',
 'select * from v_source_coverage order by domain, earliest',
 'Agent B, 10 Aug 2026')
on conflict (fact_key) do update set fact=excluded.fact, because=excluded.because, learned_at=now();

select 'done' as ok;;
