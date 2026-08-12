-- ---------------------------------------------------------------------------
-- 0028 — The Metrc report catalogue: every report we pull, how to pull it, where
-- it lands, and what it is FOR.
--
-- Owner, 10 Aug 2026: "YOU SHOULD BUILD SAME REPORTS IN OUR SYSTEM SO WE CAN
-- SIMPLY IMPORT THEM ALL."
--
-- The problem this solves. Ten exports arrived today and three of them were not
-- what their filenames said: Lab Results "all results" actually started 1/1/2025;
-- Inventory Point in Time was 31 Dec 2025, not 2024; Harvests "from 6 Jan 2024"
-- held nothing before 15 May. Two required Apex entities sat at zero rows behind a
-- green status. Without a catalogue, every import is a fresh guess about which
-- report, which licence, which date range, and which header row.
--
-- REPORTS ARE PER LICENCE. Lab Results under MP281909 starts 1/1/2025; under
-- MC281714 it reaches back to 9/2024 with 4,403 rows for 2024. Pulling one and
-- concluding "there is no 2024 data" is exactly the mistake that was made.
-- Every row here names its licence.
-- ---------------------------------------------------------------------------

create table if not exists metrc_report_catalog (
  report_key        text primary key,
  metrc_report_name text not null,
  licence           text not null,
  target_table      text,
  header_row        integer not null default 12,
  file_pattern      text,
  date_filtered     boolean not null default true,
  earliest_available date,
  pull_frequency    text,
  why               text not null,
  gotcha            text,
  last_pulled_on    date,
  last_period       text,
  last_rows         integer,
  active            boolean not null default true,
  updated_at        timestamptz not null default now()
);

comment on table metrc_report_catalog is
  'Every Metrc report we pull: which licence, which target table, which header row, '
  'and what it is for. REPORTS ARE PER LICENCE -- Lab Results under MP281909 starts '
  '1/1/2025 while MC281714 reaches back to 9/2024. Pulling one licence and '
  'concluding the data does not exist is the error this catalogue prevents.';

insert into metrc_report_catalog
 (report_key, metrc_report_name, licence, target_table, header_row, file_pattern,
  date_filtered, earliest_available, pull_frequency, why, gotcha,
  last_pulled_on, last_period, last_rows) values

('harvests_mc','Harvests','MC281714','metrc_rpt_harvests',12,'HarvestsReport*.xls',
 true,'2024-05-15','weekly',
 'Wet weight, waste, packaged and current weight per harvest. The plant-side balance starts here.',
 'Asked for everything from 6 Jan 2024 it returns NOTHING before 15 May 2024. That is Metrc''s true earliest, not a truncation -- 380 records, exactly what we hold. Do not chase "missing" earlier harvests.',
 '2026-08-06','1/6/2024 - 8/6/2026',380),

('harvest_moisture_mc','Harvests - Inactive','MC281714','metrc_rpt_harvest_moisture',12,'Harvests*Inactive*.xls',
 true,'2024-05-15','weekly',
 'THE ONLY SOURCE OF RECORDED MOISTURE LOSS. The API has no moisture field -- CurrentWeight is a residual. Every mass balance depends on this file.',
 'moisture_loss_lb equals wet-waste-packaged to six decimals, so the balance closes BY IDENTITY. It proves consistency, never honesty.',
 '2026-08-04',null,350),

('lab_results_mc','Lab Results','MC281714','metrc_rpt_lab_results',12,'LabResultsReport*.xls',
 true,'2024-09-01','weekly',
 'Potency and contaminant results per package tag.',
 'PER LICENCE. The MC281714 export reaches back to 9/2024 (4,403 rows for 2024); MP281909 starts 1/1/2025. Pull BOTH. Also names Assured Testing Laboratories, a lab absent from the manufacturing manifests.',
 '2026-08-10','9/1/2024 - 8/10/2026',20484),

('lab_results_mp','Lab Results','MP281909','metrc_rpt_lab_results',12,'LabResultsReport*.xls',
 true,'2025-01-10','weekly',
 'Manufacturing-side potency and contaminant results.',
 'Starts 1/1/2025. Concluding from this file alone that 2024 has no lab results is wrong -- see lab_results_mc.',
 '2026-08-06','1/1/2025 - 8/6/2026',23450),

('point_in_time_mc','Inventory Point in Time','MC281714','metrc_rpt_point_in_time',12,'InventoryPointInTimeReport*.xls',
 false,'2024-01-01','per year end',
 'A TRUE point-in-time position. Metrc packages carry only today''s quantity, so a historical position cannot be reconstructed -- it must be pulled.',
 'CARRIES NO WEIGHT COLUMN. Type, Tag, Name, Category, Strain, Location, Status only. Gives count and room, never pounds. Snapshot at 1 Jan is the CLOSE of 31 Dec.',
 '2026-08-10','1/1/2025 (= close of 31 Dec 2024)',2103),

('point_in_time_mp','Inventory Point in Time','MP281909','metrc_rpt_point_in_time',12,'InventoryPointInTimeReport*.xls',
 false,'2024-01-01','per year end',
 'Manufacturing point-in-time position.',
 'The 1 Jan 2024 pull returned Total Records: 0. An empty report with an explicit zero IS EVIDENCE -- opening stock was nil -- not a failed pull.',
 '2026-08-10','1/1/2024',0),

('packages_transferred_mc','Packages Transferred','MC281714','metrc_rpt_package_transfers',0,'Metrc-*-MC281714-Packages-Transferred*.xlsx',
 true,'2024-01-01','weekly',
 'Cultivation-side transfers with manifest, source harvest, category, and BOTH shipper and receiver price per package.',
 'HEADER IS ROW 0 on the .xlsx exports, not 12. Only 67 of 411 2024 lines carry a wholesale price. Carries "Transferred Lab Testing State" -- whether a package was tested AT THE MOMENT IT SHIPPED -- which our table has no column for.',
 '2026-08-10',null,4902),

('plants_destroyed_mc','Plants Destroyed','MC281714','metrc_rpt_plants_destroyed',12,'PlantsDestroyedReport*.xls',
 true,'2023-12-19','monthly',
 'Every plant destroyed, with phase and strain.',
 'THERE IS NO "DESTROYED ON" COLUMN. The date is phase_date. Our table has destroyed_on/by/note which Metrc never exports -- they are NULL on all 3,773 rows and reading one reported "zero destroyed in 2024" when 3,025 were.',
 '2026-08-06','1/6/2024 - 8/6/2026',3772),

('adjustments_mp','Packages Adjustments','MP281909','metrc_rpt_adjustments',13,'PackagesAdjustmentsReport*.xls',
 true,'2024-03-19','monthly',
 'Negative and positive package adjustments with reasons. 540.0 lb of 2024 loss sits here.',
 'HEADER IS ROW 13 on this report, not 12. Reasons are Entry Error / Over-Under Pulled / Processing Loss / Spoilage / Waste and Metrc does not separate record corrections from real material loss.',
 '2026-08-06','1/1/2024 - 8/6/2026',3665),

('test_batches_mc','Test Batches Relationships','MC281714','metrc_rpt_test_batches',12,'TestBatchesRelationshipsReport*.xls',
 true,'2023-01-01','weekly',
 'Harvest batch to package to test batch, with test date and pass/fail. Reaches back further than Lab Results.',
 'The ONLY report holding 2024 test dates before the Lab Results window -- 337 rows. Carries Process Validation and L.T.E. Date, neither of which our table has a column for.',
 '2026-08-10','1/1/2023 - 8/10/2026',739),

('wholesale','Wholesale Transfers',
 'MC281714','metrc_rpt_wholesale',9,'WholesaleTransfersReport*.xls',
 true,'2024-08-19','monthly',
 'Manifest-level wholesale values with shipped/received variance.',
 'HEADER IS ROW 9. Only 12 rows dated 2024 -- too thin to carry the 2024 wholesale picture alone. The % Var columns are the built-in discrepancy signal and we drop them.',
 '2026-08-10','8/19/2024 - 7/28/2026',463),

('packages_inventory_mp','Packages Inventory','MP281909','metrc_rpt_packages_inventory',12,'PackagesInventoryReport*.xls',
 true,'2024-02-27','weekly',
 'Current manufacturing inventory with location and lab-testing state.',
 'Carries the inbound Manifest per package -- the chain-of-custody link -- which our table drops.',
 '2026-08-06','1/1/2024 - 8/6/2026',446),

('plants_trend_mc','Plants Trend','MC281714',null,12,'PlantsTrendReport*.xls',
 true,'2024-01-01','monthly',
 'Plant counts over time by room and phase.',
 'NOT YET PARSED. The export merges header cells so no column names survive a normal read, and it has no target table.',
 '2026-08-06','1/1/2024 - 8/6/2026',952)

on conflict (report_key) do update set
  gotcha=excluded.gotcha, why=excluded.why, header_row=excluded.header_row,
  last_pulled_on=excluded.last_pulled_on, last_period=excluded.last_period,
  last_rows=excluded.last_rows, updated_at=now();

alter table metrc_report_catalog enable row level security;
drop policy if exists metrc_report_catalog_read on metrc_report_catalog;
create policy metrc_report_catalog_read on metrc_report_catalog for select to authenticated using (true);
grant select on metrc_report_catalog to authenticated;

-- What is stale, and what has never been pulled at all.
create or replace view v_report_pull_status as
select c.report_key, c.metrc_report_name, c.licence, c.target_table,
       c.last_pulled_on, c.last_period, c.last_rows,
       (current_date - c.last_pulled_on)                      as days_since_pull,
       c.pull_frequency,
       case when c.target_table is null      then 'NO TARGET TABLE — parsed nowhere'
            when c.last_pulled_on is null    then 'NEVER PULLED'
            when current_date - c.last_pulled_on > 30 then 'STALE — over 30 days'
            when current_date - c.last_pulled_on > 7  then 'ageing — over a week'
            else 'current' end                                as freshness,
       c.gotcha
from metrc_report_catalog c
where c.active;

comment on view v_report_pull_status is
  'Which Metrc reports are current, stale, or land nowhere. Read gotcha before '
  'importing any of them -- header row varies by report (0, 9, 12 and 13 all occur) '
  'and three reports do not cover the period their filename implies.';

grant select on v_report_pull_status to authenticated;
;
