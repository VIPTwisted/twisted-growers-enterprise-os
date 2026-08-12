-- ---------------------------------------------------------------------------
-- 0020 — Two controls the owner asked for on 10 Aug 2026:
--
--   source_export        every Metrc/Apex export we hold: what period it ACTUALLY
--                        covers, its SHA-256, and whether the audit used it. A
--                        report's filename does not state its period; its title
--                        block does, and they disagree often enough to matter.
--
--   f_field_coverage()   for every source table, which columns are POPULATED and
--                        which are always NULL. "IT IS UNACCEPTABLE FOR OS NOT TO
--                        CAPTURE EVERY FIELD FROM EVERY REPORT."
--
-- WHY THE SECOND ONE EXISTS. metrc_rpt_plants_destroyed.destroyed_on is NULL on
-- ALL 3,773 rows. Reading it returned zero, and this audit reported "ZERO plants
-- destroyed in 2024" to the owner. The truth is in phase_date: 3,025 plants. An
-- always-NULL column does not error, it answers zero -- which is the most
-- dangerous shape a data gap can take.
-- ---------------------------------------------------------------------------

create table if not exists source_export (
  file_name      text primary key,
  system         text not null check (system in ('metrc','apex')),
  report         text not null,
  licence        text,
  period_stated  text,
  period_actual  text,
  rows_in_file   integer,
  sha256_16      text,
  used_in_audit  boolean not null default false,
  what_it_proved text,
  stored_at      text,
  captured_on    date not null default current_date
);

comment on table source_export is
  'Every Metrc/Apex export held as audit evidence. period_stated is the title '
  'block; period_actual is what the DATA spans -- they differ, and the difference '
  'has already changed conclusions. used_in_audit marks the ones that decided something.';

alter table source_export enable row level security;
drop policy if exists source_export_read on source_export;
create policy source_export_read on source_export for select to authenticated using (true);

insert into source_export (file_name, system, report, licence, period_stated, period_actual,
                           rows_in_file, sha256_16, used_in_audit, what_it_proved, stored_at) values
('HarvestsReport (1).xls','metrc','Harvests','MC281714','From 1/6/2024 To 8/6/2026',
 'Batch Date 2024-05-15 .. 2026-07-27', 380, '21F15C97AE84E477', true,
 'DECISIVE. Metrc was asked for everything from 6 Jan 2024 and returned nothing before 15 MAY 2024, 380 records -- exactly what metrc_harvests holds. Our harvest sync is COMPLETE, not 42 or 77 harvests behind. That request is withdrawn.',
 'repo docs/metrc-exports/'),
('LabResultsReport.xls','metrc','Lab Results','MP281909','From 1/1/2025 To 8/6/2026',
 'Test Date 2025-01-10 .. 2026-08-06', 23450, '7C37609D37EB1FA1', true,
 'Confirms the 2024 COA gap is REAL and not a sync fault: this export STARTS 1 Jan 2025. 2024 lab results must be pulled with an explicit 2024 date range.',
 'repo docs/metrc-exports/'),
('TestBatchesRelationshipsReport (8).xls','metrc','Test Batches Relationships','MC281714','From 1/1/2023 To 8/10/2026',
 'Test Date 2024-06-04 .. 2026-08-03 (2024: 337 rows)', 739, '1A7AA20E9D92ACE6', true,
 'HIGH VALUE. Carries 337 rows of 2024 TEST DATES with pass/fail and harvest batch -- partially closes the 2024 testing gap that Lab Results cannot.',
 'repo docs/metrc-exports/'),
('PlantsDestroyedReport.xls','metrc','Plants Destroyed','MC281714','From 1/6/2024 To 8/6/2026',
 'Phase Date 2023-12-19 .. 2026-05-18 (2024: 3,025)', 3772, 'A69C01EA25139DEF', true,
 'CORRECTED A REPORTED FIGURE. The audit said "ZERO plants destroyed in 2024" from destroyed_on, which is NULL on all 3,773 rows. True figure: 3,025 in 2024 -- 2,530 vegetative, 495 flowering, all harvested 0 times so they carry no pounds.',
 'repo docs/metrc-exports/'),
('InventoryPointInTimeReport (4).xls','metrc','Inventory Point in Time','MC281714','12/31/2025',
 'Snapshot at 31 Dec 2025', 3364, '5F453A3C1B6CB97B', true,
 'A TRUE point-in-time snapshot -- but for 31 Dec 2025, NOT 2024. Closes the 2025 year end. The 2024 snapshot still has to be pulled.',
 'repo docs/metrc-exports/'),
('Metrc-Massachusetts-MC281714-Packages-Transferred (1).xlsx','metrc','Packages Transferred','MC281714',
 'not stated', 'Received Date .. 2026-08-06', 4902, '7428722B4A2A04B5', true,
 'Fills a known hole: the CULTIVATION licence transfer export, previously absent. Carries manifest number, source harvest, shipper and receiver price per package.',
 'repo docs/metrc-exports/'),
('PackagesAdjustmentsReport (2).xls','metrc','Packages Adjustments','MP281909','From 1/1/2024 To 8/6/2026',
 'Adj. Date 2024-03-19 .. 2026-08-06 (2024: 114)', 3665, 'CA2716F784E3A4F6', true,
 'Source of the 540.0 lb of 2024 negative adjustments with reasons.', 'repo docs/metrc-exports/'),
('WholesaleTransfersReport (3).xls','metrc','Wholesale Transfers',null,'not stated',
 'Created 2024-08-19 .. 2026-07-28 (2024: 12)', 463, '7375D5FF8F6BB4E3', false,
 'Only 12 rows dated 2024 -- too thin to carry the 2024 wholesale picture on its own.',
 'repo docs/metrc-exports/'),
('PackagesInventoryReport (2).xls','metrc','Packages Inventory','MP281909','From 1/1/2024 To 8/6/2026',
 'Date 2024-02-27 .. 2026-08-06 (2024: 34)', 446, '2777D2FF4B8BD44F', false,
 'Current inventory, manufacturing licence. Superseded by the live package mirror.',
 'repo docs/metrc-exports/'),
('PlantsTrendReport (1).xls','metrc','Plants Trend','MC281714','From 1/1/2024 To 8/6/2026',
 'headers not parsed - merged cells', 952, '34BBC70D346A97AB', false,
 'Not yet parsed: the export merges header cells so no column names survive a normal read.',
 'repo docs/metrc-exports/'),
('Metrc-Massachusetts-MC281714-Packages-Active (1).xlsx','metrc','Packages Active','MC281714','not stated',
 'Packaged Date 2023-12-19 .. 2027-08-03', 86, '4F57BE0963EBEB7A', false,
 'Cultivation active packages. Cross-check for the live mirror.', 'repo docs/metrc-exports/'),
('Metrc-Massachusetts-MC281714-Packages-Inactive (2).xlsx','metrc','Packages Inactive','MC281714','not stated',
 'Packaged Date 2024-07-11 .. 2026-08-04', 1562, '41224E8E9DF5B792', false,
 'Cultivation inactive packages. Needed for a true 31 Dec point-in-time reconstruction.',
 'repo docs/metrc-exports/')
on conflict (file_name) do update set
  period_actual = excluded.period_actual, rows_in_file = excluded.rows_in_file,
  sha256_16 = excluded.sha256_16, used_in_audit = excluded.used_in_audit,
  what_it_proved = excluded.what_it_proved, stored_at = excluded.stored_at;


-- ---------------------------------------------------------------------------
-- FIELD COVERAGE. Which columns do we have but never fill?
-- ---------------------------------------------------------------------------
create or replace function f_field_coverage(p_pattern text default 'metrc_rpt_%')
returns table (table_name text, column_name text, data_type text,
               rows bigint, non_null bigint, pct_filled numeric, verdict text)
language plpgsql stable as $$
declare r record; n bigint; f bigint;
begin
  for r in
    select c.table_name::text as t, c.column_name::text as c, c.data_type::text as d
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and tb.table_type = 'BASE TABLE'
      and c.table_name like p_pattern
    order by c.table_name, c.ordinal_position
  loop
    execute format('select count(*), count(%I) from public.%I', r.c, r.t) into n, f;
    table_name := r.t; column_name := r.c; data_type := r.d;
    rows := n; non_null := f;
    pct_filled := case when n = 0 then null else round(100.0 * f / n, 1) end;
    verdict := case
      when n = 0            then 'table is empty'
      when f = 0            then 'ALWAYS NULL — the OS has this column and never captures it'
      when f < n * 0.02     then 'barely populated (<2%)'
      when f < n            then 'partially populated'
      else 'fully populated' end;
    return next;
  end loop;
end $$;

comment on function f_field_coverage(text) is
  'Which columns exist but are never populated. An always-NULL column does not '
  'error -- it answers ZERO, which is how this audit came to report "zero plants '
  'destroyed in 2024" when 3,025 were. Run it before trusting any count of nothing.';

grant execute on function f_field_coverage(text) to authenticated;
grant select on source_export to authenticated;
;
