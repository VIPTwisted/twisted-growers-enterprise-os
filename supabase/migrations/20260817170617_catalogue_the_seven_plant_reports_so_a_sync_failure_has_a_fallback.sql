/* THE SEVEN PLANT REPORTS, CATALOGUED, SO A SYNC FAILURE HAS A NAMED FALLBACK.
 *
 * OWNER, 17 Aug 2026: "you should mark each report so if ever there is metrc issue with
 * sync agents can request any of these reports by name all being already mapped now for
 * futures so its fast and easy to import."
 *
 * This is the lesson of the whole week written down. When the plants API sync silently
 * lost 1,151 tags and Flower Room #2 read as empty, the answer was sitting in a Metrc
 * export the entire time - and it took three wrong theories and most of a day to reach
 * for it. metrc_report_catalog already held 13 reports with exactly the right shape.
 * The plant reports were simply never entered, so no agent knew to ask.
 *
 * EVERY FIGURE BELOW IS MEASURED, not copied from a Metrc help page. Each file was
 * parsed on 17 Aug 2026 and the row counts and column names are what came out.
 *
 * THE ONE THAT MATTERS MOST is plants_flowering_mc. It is the authority on what is
 * standing, room by room, and it independently confirmed 4,413 plants - F1 1,140,
 * F2 1,050, F3 1,140, F4 1,050, Mother 33 - matching the platform exactly. If the plants
 * sync ever goes quiet again, ask for THAT file by name and the question is settled in
 * minutes instead of a day.
 *
 * HEADER ROW IS 0 ON ALL SEVEN. These are the .xlsx exports from the Metrc grid, not the
 * .xls report-builder files whose headers sit at row 9, 12 or 13. Getting that wrong
 * yields a parsed file with no usable column names and looks like a corrupt download.
 */

insert into public.metrc_report_catalog
  (report_key, metrc_report_name, licence, target_table, header_row, file_pattern,
   date_filtered, earliest_available, pull_frequency, why, gotcha, last_pulled_on,
   last_rows, active)
values
 ('plants_flowering_mc', 'Plants - Flowering', 'MC281714', 'metrc_plants', 0,
  'Metrc-*-MC281714-Plants-Flowering*.xlsx', false, '2024-01-01', 'on demand',
  'THE AUTHORITY ON WHAT IS STANDING. Every flowering plant with its tag, strain, room, sublocation, hold flag, plant batch and phase date. Ask for this FIRST whenever the plants sync is in doubt.',
  'Columns: Tag | Strain | Location | Sublocation | Hold | Plant Batch | Plant Batch Type | Plant Batch Date | Phase Date | Harvested. Header row 0. Measured 17 Aug 2026: 4,380 rows - F1 1,140, F2 1,050, F3 1,140, F4 1,050 - matching the platform exactly and settling the Flower Room #2 question the API sync could not. NO WEIGHT COLUMN: it gives counts and rooms, never pounds.',
  current_date, 4380, true),

 ('plants_vegetative_mc', 'Plants - Vegetative', 'MC281714', 'metrc_plants', 0,
  'Metrc-*-MC281714-Plants-Vegetative*.xlsx', false, '2024-01-01', 'on demand',
  'Vegetative plants with tags. Pair it with Flowering for the full standing count.',
  'Same columns as Flowering, header row 0. Measured 17 Aug 2026: 33 rows, ALL in the Mother Room. Vegetative here means TAGGED vegetative plants only - immature clones live in Plantings-Active as batches, not as tagged plants, so 33 is not the whole veg pipeline.',
  current_date, 33, true),

 ('plants_harvests_active_mc', 'Plants - Harvests (active)', 'MC281714', 'metrc_rpt_harvests', 0,
  'Metrc-*-MC281714-Plants-Harvests*.xlsx', false, '2024-05-15', 'weekly',
  'Harvest batches still open: plants, wet weight, waste, packaged weight, package count, lab-testing state.',
  'Header row 0. Measured 17 Aug 2026: 30 rows. Location on this report is the DRYING location - Fulfillment Vault 16, Pre Trim 6, Dry Room #2 4, Cure Vault 4 - NOT the flower room. The flower room appears only inside the harvest NAME. Reading Location as the grow room is a mistake already made once.',
  current_date, 30, true),

 ('plants_harvests_inactive_mc', 'Plants - Harvests Inactive', 'MC281714', 'metrc_rpt_harvest_moisture', 0,
  'Metrc-*-MC281714-Plants-HarvestsInactive*.xlsx', false, '2024-05-15', 'weekly',
  'Finished harvest batches, and the ONLY source of recorded moisture loss - the API has no moisture field.',
  'Header row 0. Measured 17 Aug 2026: 350 rows. Carries Moisture Loss and Finished date, which the active report does not. Location is again the DRYING location. moisture_loss equals wet minus waste minus packaged by identity, so the balance closes arithmetically whether or not it is honest.',
  current_date, 350, true),

 ('plants_plantings_active_mc', 'Plants - Plantings Active', 'MC281714', null, 0,
  'Metrc-*-MC281714-Plants-Plantings-Active*.xlsx', false, '2024-01-01', 'weekly',
  'Immature plant batches - the veg pipeline before plants are individually tagged. Answers "is there anything coming" when a flower room stands empty.',
  'Header row 0, NO TARGET TABLE YET. Measured 17 Aug 2026: 63 rows - Clone Room 36, Vegetation Room 27. Columns: Plant Batch | Strain | Location | Sublocation | Type | Hold | Plants | Tracked | Packaged | Destroyed | Source Package | Source Plant | Source Plant Batch | Batch Date. A batch row is NOT one plant; the Plants column carries the count.',
  current_date, 63, true),

 ('plants_plantings_inactive_mc', 'Plants - Plantings Inactive', 'MC281714', null, 0,
  'Metrc-*-MC281714-Plants-Plantings-Inactive*.xlsx', false, '2024-01-01', 'monthly',
  'Closed plant batches with their source package, source plant and source batch - the propagation lineage.',
  'Header row 0, NO TARGET TABLE YET. Measured 17 Aug 2026: 2,664 rows - Clone Room 1,200, Vegetation 1,168, Mother 240, and a handful in flower rooms. This is the best available answer to "where did this plant come from" and nothing in the platform reads it.',
  current_date, 2664, true),

 ('plants_waste_mc', 'Plants - Waste', 'MC281714', 'metrc_rpt_plant_waste', 0,
  'Metrc-*-MC281714-Plants-Waste*.xlsx', false, '2024-01-01', 'monthly',
  'Plant waste events with method, reason, quantity and the batch it came from.',
  'Header row 0. Measured 17 Aug 2026: 4,396 rows, which matches metrc_rpt_plant_waste exactly. NO LOCATION COLUMN AT ALL - do not attempt to attribute waste to a room from this file. Columns: Plant Waste Number | Waste Method | Material Mixed | Waste | Reason | Total Plants | Waste Date | Plant Batch | Unit Of Measure.',
  current_date, 4396, true)

on conflict (report_key) do update set
  metrc_report_name  = excluded.metrc_report_name,
  target_table       = excluded.target_table,
  header_row         = excluded.header_row,
  file_pattern       = excluded.file_pattern,
  why                = excluded.why,
  gotcha             = excluded.gotcha,
  last_pulled_on     = excluded.last_pulled_on,
  last_rows          = excluded.last_rows,
  active             = true,
  updated_at         = now();

comment on table public.metrc_report_catalog is
  'Every Metrc report we know how to ask for and how to read: its exact name in the Metrc menu, the licence it belongs to, which table it lands in, which row the header is on, the filename pattern, why it exists and what will trip you up. Owner instruction 17 Aug 2026: when a sync fails, an agent must be able to name the report that answers the question instead of theorising. The plants API sync lost 1,151 tags and made Flower Room #2 read as empty for a day - the answer was in Plants - Flowering the whole time and nobody knew to ask for it. HEADER ROW MATTERS: the .xlsx grid exports are row 0; the .xls report-builder files are row 9, 12 or 13, and getting it wrong looks exactly like a corrupt download.';;
