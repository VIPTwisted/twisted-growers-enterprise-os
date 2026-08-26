/* Catalogue the three reference exports, and map every column.
 *
 * Owner sent Locations, Strains and Items for MC281714 on 17 Aug 2026, under the
 * standing instruction to mark each report so an agent can request it by name, and
 * to record how every field is used rather than leaving it to judgement.
 *
 * VERIFIED BEFORE CATALOGUING. Each export was read and counted against our mirror:
 *   Locations  21 in the export, 21 in metrc_locations for MC281714, name for name
 *   Strains   102 in the export, 102 in metrc_strains  for MC281714
 *   Items     494 in the export, 494 in metrc_items    for MC281714
 * Three clean agreements. The reference sync is healthy and this is the evidence.
 *
 * THE THREE TRAPS THESE FILES CARRY, all recorded in gotcha or notes:
 *
 * 1. The Locations columns "Plant Batches", "Plants", "Harvests", "Packages" hold 1
 *    on every row. They are PERMISSION FLAGS — what the room is allowed to hold —
 *    not counts. Reading them as counts reports one plant batch per room, which is
 *    wrong in a way that looks plausible.
 *
 * 2. Item name and Strain routinely disagree. "TG Blueberry Gas Flower" is registered
 *    against strain "TG Glitter Bomb". That is correct: a blend has no single strain
 *    (owner ruling D4, identity is the tag). 84% of 956 "discrepancies" once came from
 *    exactly this misreading, so it is written into the catalogue rather than trusted
 *    to memory.
 *
 * 3. Strain THC/CBD are REGISTRATION targets, blank or a round 25/30, never
 *    measurements. Potency comes from a COA. Quoting these as potency would put an
 *    invented number in front of a regulator.
 *
 * Created Date and Approval Date on Items are Excel serials (46245.513), not dates.
 */

insert into public.metrc_report_catalog
  (report_key, metrc_report_name, licence, target_table, header_row, file_pattern,
   date_filtered, pull_frequency, why, gotcha, last_pulled_on, last_rows, active)
values
  ('locations_mc','Locations','MC281714','metrc_locations',0,
   'Metrc-Massachusetts-MC281714-Locations*.xlsx', false, 'when a room is added or retired',
   'The authoritative list of rooms. Everything room-keyed — harvest cycle compliance, '
   || 'plant counts, the production schedule — resolves through these names.',
   'Grid export, header on row 0, no report-builder preamble. Metrc can RENAME a room; '
   || 'metrc_id is the only stable key and location_note hangs off it for that reason. '
   || 'Verified 17 Aug 2026: 21 rows, matching our mirror name for name.',
   date '2026-08-17', 21, true),

  ('strains_mc','Strains','MC281714','metrc_strains',0,
   'Metrc-Massachusetts-MC281714-Strains*.xlsx', false, 'when genetics change',
   'The strain list with THC/CBD targets. These are Metrc REGISTRATION values, not test '
   || 'results — the measured figure comes from a COA and the two must never be mixed.',
   'THC and CBD are blank on roughly half the rows and 25/30 elsewhere: those are round '
   || 'registration defaults, not measurements. Never quote them as potency. Identity is '
   || 'the tag, not the strain — owner ruling D4. Verified 17 Aug 2026: 102 rows, '
   || 'matching our mirror.',
   date '2026-08-17', 102, true),

  ('items_mc','Items','MC281714','metrc_items',0,
   'Metrc-Massachusetts-MC281714-Items*.xlsx', false, 'when the product catalogue changes',
   'The product catalogue: item name, category, unit of measure, and the strain each '
   || 'item is registered against. The bridge from a package to a sellable product.',
   'THIRTY-FIVE columns and most cannabinoid fields are empty. Item name and Strain '
   || 'routinely DISAGREE by design — "TG Blueberry Gas Flower" is registered against '
   || 'strain "TG Glitter Bomb" — because a blend has no single strain (owner ruling D4). '
   || 'That is not a discrepancy and must never be reported as one. Created Date and '
   || 'Approval Date are Excel serial numbers, not dates. Only 224 of 494 items have '
   || 'Used=1. Verified 17 Aug 2026: 494 rows, matching our mirror.',
   date '2026-08-17', 494, true)
on conflict (report_key) do update
  set gotcha = excluded.gotcha, why = excluded.why,
      last_pulled_on = excluded.last_pulled_on, last_rows = excluded.last_rows,
      active = true, updated_at = now();

insert into public.metrc_report_field_map
  (report_key, source_column, target_table, target_column, target_json_key,
   is_lineage, transform, why_unmapped, notes)
values
  ('locations_mc','Location','metrc_locations','name',null,false,'trim',null,
   'Display name. Can be renamed in Metrc — never use as a stable key.'),
  ('locations_mc','Location Type','metrc_locations','location_type',null,false,'trim',null,
   'All 21 read "Default Location Type" — Metrc has the field but TG does not use it.'),
  ('locations_mc','Plant Batches','metrc_locations',null,'ForPlantBatches',false,'0/1 to boolean',null,
   'A permission flag on the room, NOT a count. Reading it as a count would report 1 plant batch per room.'),
  ('locations_mc','Plants','metrc_locations',null,'ForPlants',false,'0/1 to boolean',null,'Permission flag, not a count.'),
  ('locations_mc','Harvests','metrc_locations',null,'ForHarvests',false,'0/1 to boolean',null,'Permission flag, not a count.'),
  ('locations_mc','Packages','metrc_locations',null,'ForPackages',false,'0/1 to boolean',null,'Permission flag, not a count.'),

  ('strains_mc','Strain','metrc_strains','name',null,false,'trim',null,'Join key to metrc_items.Strain.'),
  ('strains_mc','Testing','metrc_strains',null,'TestingStatus',false,'trim',null,'"None" on all 102 rows.'),
  ('strains_mc','THC','metrc_strains',null,'ThcLevel',false,'numeric; registration target only',null,
   'NOT a measurement. Blank or a round 25/30. Potency comes from the COA.'),
  ('strains_mc','CBD','metrc_strains',null,'CbdLevel',false,'numeric; registration target only',null,
   'NOT a measurement. Zero on every populated row.'),
  ('strains_mc','Genetics','metrc_strains',null,'Genetics',false,'trim',null,'Empty on all 102 rows in the 17 Aug export.'),
  ('strains_mc','Used','metrc_strains',null,'IsUsed',false,'0/1 to boolean',null,'1 on all 102 — every strain is in use.'),

  ('items_mc','Item','metrc_items','name',null,false,'trim; keeps the "M000…: " prefix',null,
   'The prefix before the colon is Metrc''s internal item number and is part of the name as exported.'),
  ('items_mc','Category','metrc_items','category',null,false,'trim',null,null),
  ('items_mc','Strain','metrc_items','strain_name',null,false,'trim',null,
   'The REGISTERED strain, which routinely differs from the item name. A blend has no single strain — owner ruling D4. Never flag the difference as a discrepancy.'),
  ('items_mc','Unit of Measure','metrc_items','uom',null,false,'trim; never compare a quantity without it',null,
   'Grams and Each both appear. Normalise before any sum.'),
  ('items_mc','Quantity Type','metrc_items',null,'QuantityType',false,'trim',null,'WeightBased or CountBased — decides which arithmetic is legal.'),
  ('items_mc','Default Lab Testing State','metrc_items',null,'DefaultLabTestingState',false,'trim',null,null),
  ('items_mc','Approval','metrc_items',null,'ApprovalStatus',false,'trim',null,null),
  ('items_mc','Created Date','metrc_items',null,'CreatedDate',false,
   'EXCEL SERIAL, not a date — convert from the 1899-12-30 epoch',null,
   'Exports as 46245.513. Loading it as text produces a nonsense date.'),
  ('items_mc','Approval Date','metrc_items',null,'ApprovalDate',false,'Excel serial, same conversion',null,null),
  ('items_mc','Item Brand Name','metrc_items',null,'ItemBrandName',false,'trim',null,'Empty on every row in the 17 Aug export.'),
  ('items_mc','Used','metrc_items',null,'IsUsed',false,'0/1 to boolean',null,
   'Only 224 of 494 are 1. An unused item is catalogue bloat, not inventory — never count it as stock.'),
  ('items_mc','Misconfigured','metrc_items',null,'IsMisconfigured',false,'0/1 to boolean',null,
   'Metrc''s own flag that the item is set up wrongly. 0 on all 494 today; if it ever goes to 1 that is a finding.'),
  ('items_mc','Unit Weight','metrc_items',null,'UnitWeight',false,'numeric',null,null),
  ('items_mc','Unit Volume','metrc_items',null,'UnitVolume',false,'numeric',null,null),
  ('items_mc','Unit Quantity','metrc_items',null,'UnitQuantity',false,'numeric',null,null),
  ('items_mc','Number of Doses','metrc_items',null,'NumberOfDoses',false,'numeric',null,null),
  ('items_mc','Expiration Date Required','metrc_items',null,'ExpirationDateConfiguration',false,'On/Off to boolean',null,null),
  ('items_mc','Sell-By Date Required','metrc_items',null,'SellByDateConfiguration',false,'On/Off to boolean',null,null),
  ('items_mc','Use-By Date Required','metrc_items',null,'UseByDateConfiguration',false,'On/Off to boolean',null,null),
  ('items_mc','Type',null,null,null,false,null,
   'Duplicate of Category on every row in the 17 Aug export. Storing both would create two '
   || 'definitions of one primitive, which is the countable DDC defect.',
   'Re-check on the next pull; if it ever diverges from Category it must be mapped.'),
  ('items_mc','Unit THC Percent',null,null,null,false,null,
   'Empty on all 494 rows. Potency is a measured value and comes from the COA, never from '
   || 'the item catalogue. Mapping an always-blank field would imply we hold potency here.',
   'The same applies to every Unit CBD/CBDA/THC/THCA percent, content and dose column — 12 in total.')
on conflict (report_key, source_column) do update
  set target_table = excluded.target_table, target_column = excluded.target_column,
      target_json_key = excluded.target_json_key, transform = excluded.transform,
      why_unmapped = excluded.why_unmapped, notes = excluded.notes;
