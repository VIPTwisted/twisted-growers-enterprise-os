/* The two package reports, column by column, with nothing left to an agent's judgement.
 *
 * Headers read from the owner's own 6-7 Aug exports, not from Metrc documentation:
 *   Metrc-Massachusetts-MC281714-Packages-Active.xlsx        20 columns
 *   Metrc-Massachusetts-MC281714-Packages-Inactive.xlsx      23 columns
 *   Metrc-Massachusetts-MC281714-Packages-Transferred.xlsx   17 columns
 *
 * The Active and Inactive exports share a body and differ at the tail, so both are
 * mapped under packages_lineage_mc with the export named in notes. Columns that are
 * deliberately NOT loaded carry why_unmapped; there are two, and both are choices.
 *
 * Twenty of these rows exist because of a specific defect that reached the owner.
 * Where that is so, the note says which one, so the next agent inherits the scar
 * rather than the lesson alone.
 */

insert into public.metrc_report_field_map
  (report_key, source_column, target_table, target_column, target_json_key,
   is_lineage, transform, why_unmapped, notes)
values
  /* ── Packages grid export (Active / Inactive), MC281714 ─────────────────────── */
  ('packages_lineage_mc','Tag','metrc_packages','tag',null,false,
   'trim; this is the join key for every other column',null,
   'Metrc calls it Tag here and Package on the Transferred export. Same value.'),
  ('packages_lineage_mc','Source Harvest(s)','metrc_packages',null,'SourceHarvestNames',true,
   'trim; empty string means Metrc has no parent either, store nothing',null,
   'THE column that makes seed-to-sale work. Not in Metrc''s default column set.'),
  ('packages_lineage_mc','Source Package(s)','metrc_packages',null,'SourcePackageLabels',true,
   'trim; comma-separated list of parent tags',null,
   'A manufactured package''s parent is another package, not a harvest.'),
  ('packages_lineage_mc','Original Source Package Label','metrc_packages',null,'OriginalSourcePackageLabel',true,
   'trim','Traces past the immediate parent to the first package in the chain.',null),
  ('packages_lineage_mc','Source Processing Job(s)','metrc_packages',null,'SourceProcessingJobNames',true,
   'trim',null,'Populated only for manufacturing output.'),
  ('packages_lineage_mc','Location','metrc_packages','location',null,false,'trim',null,null),
  ('packages_lineage_mc','Sublocation','metrc_packages',null,'Sublocation',false,'trim',null,
   'No column exists; promote when the inventory lane needs shelf-level detail.'),
  ('packages_lineage_mc','Item','metrc_packages','item_name',null,false,'trim',null,null),
  ('packages_lineage_mc','Category','metrc_packages',null,'ProductCategoryName',false,'trim',null,null),
  ('packages_lineage_mc','Item Strain','metrc_packages',null,'ItemStrainName',false,'trim',null,
   'Identity is the tag, not the strain. A blend has no single strain — owner ruling D4.'),
  ('packages_lineage_mc','Quantity','metrc_packages','quantity',null,false,'numeric',null,null),
  ('packages_lineage_mc','Unit Of Measure','metrc_packages','uom',null,false,
   'trim; NEVER compare a quantity without it',null,
   'Grams and pounds both appear. Normalise before any sum.'),
  ('packages_lineage_mc','Production Batch Number','metrc_packages',null,'ProductionBatchNumber',false,'trim',null,null),
  ('packages_lineage_mc','Source Production Batch','metrc_packages',null,'SourceProductionBatchNumbers',true,'trim',null,null),
  ('packages_lineage_mc','Lab Test Status','metrc_packages','lab_testing_state',null,false,'trim',null,null),
  ('packages_lineage_mc','Finished Goods','metrc_packages','finished',null,false,
   'Yes/No or 1/0 to boolean; MUST also write raw->>''IsFinished''',null,
   'Loading this column but not IsFinished put 14,822 packages back into open inventory across 30 views on 12 Aug.'),
  ('packages_lineage_mc','Administrative Hold','metrc_packages',null,'IsOnHold',false,'Yes/No to boolean',null,null),
  ('packages_lineage_mc','Administrative Recall','metrc_packages',null,'IsOnAdministrativeRecall',false,'Yes/No to boolean',null,
   'Inactive export only. A recall must never be dropped silently.'),
  ('packages_lineage_mc','Packaged Date','metrc_packages','packaged_on',null,false,'date',null,null),
  ('packages_lineage_mc','Received','metrc_packages',null,'ReceivedDateTime',false,'timestamp',null,null),
  ('packages_lineage_mc','Finished','metrc_packages',null,'FinishedDate',false,'date',null,'Inactive export only.'),
  ('packages_lineage_mc','Discontinued','metrc_packages',null,'DiscontinuedDate',false,'date',null,'Inactive export only.'),
  ('packages_lineage_mc','Lab Test Expiration','metrc_packages',null,'LabTestExpirationDate',false,'date',null,'Active export only.'),
  ('packages_lineage_mc','Patient',null,null,null,false,null,
   'Medical patient identifier. Never loaded — it is patient data with no operational '
   || 'use in this OS, and storing it would create a duty we do not need.',
   'Inactive export carries this column. Dropping it is deliberate.'),

  /* ── Packages Transferred export, MC281714 ──────────────────────────────────── */
  ('packages_transferred_mc','Package','metrc_rpt_package_transfers','package_tag',null,false,'trim',null,
   'Same value Metrc calls Tag on the grid export.'),
  ('packages_transferred_mc','Source Harvest','metrc_rpt_package_transfers','source_harvest',null,true,'trim',null,
   'Also promoted to metrc_packages.raw->>''SourceHarvestNames''. Writing the report table alone is what broke the chain for 14,822 packages.'),
  ('packages_transferred_mc','Source Package','metrc_rpt_package_transfers','source_package',null,true,'trim',null,
   'Also promoted to metrc_packages.raw->>''SourcePackageLabels''.'),
  ('packages_transferred_mc','Manifest Number','metrc_rpt_package_transfers','manifest_number',null,false,'trim',null,
   'Join key to metrc_rpt_transfer_manifests. Join on this, never scan raw::text for the tag.'),
  ('packages_transferred_mc','Destination License','metrc_rpt_package_transfers','destination_licence',null,false,
   'trim; digits must agree before two licences are called the same party',null,
   'Suffix-variant matching without requiring digits to agree produced 163 false pairs from 4 licences.'),
  ('packages_transferred_mc','Destination Facility','metrc_rpt_package_transfers','destination_facility',null,false,'trim',null,null),
  ('packages_transferred_mc','Item','metrc_rpt_package_transfers','item',null,false,'trim',null,null),
  ('packages_transferred_mc','Category','metrc_rpt_package_transfers','category',null,false,'trim',null,null),
  ('packages_transferred_mc','Item Strain','metrc_rpt_package_transfers','strain',null,false,'trim',null,null),
  ('packages_transferred_mc','Transferred Lab Testing State','metrc_rpt_package_transfers',null,null,false,null,
   'Not stored. The authoritative testing state is metrc_packages.lab_testing_state; '
   || 'a second copy frozen at transfer time would drift and then be believed.',
   'Deliberate omission, not an oversight.'),
  ('packages_transferred_mc','Shipped Quantity','metrc_rpt_package_transfers','shipped_qty',null,false,'numeric',null,null),
  ('packages_transferred_mc','Gross Weight','metrc_rpt_package_transfers','gross_weight',null,false,'numeric',null,
   'Includes packaging. Never compare against a net figure.'),
  ('packages_transferred_mc','Shipper Wholesale Price','metrc_rpt_package_transfers','shipper_wholesale_price',null,false,'numeric',null,
   'The money column. Reconciles against Apex orders.'),
  ('packages_transferred_mc','Received Quantity','metrc_rpt_package_transfers','received_qty',null,false,'numeric',null,
   'Differs from shipped on a short receipt — that difference is a finding.'),
  ('packages_transferred_mc','Receiver Wholesale Price','metrc_rpt_package_transfers','receiver_wholesale_price',null,false,'numeric',null,null),
  ('packages_transferred_mc','Status','metrc_rpt_package_transfers','status',null,false,'trim',null,
   'Accepted / Rejected / Returned. 18,283 lines measured 100% Accepted on 15 Aug, which is how the IN TRANSIT 649 tile was proven wrong.'),
  ('packages_transferred_mc','Received Date','metrc_rpt_package_transfers','received_on',null,false,'date',null,
   'A NULL here means not yet received. Check the column is populated before reading NULL as an answer — three findings were withdrawn for exactly that.')
on conflict (report_key, source_column) do update
  set target_table    = excluded.target_table,
      target_column   = excluded.target_column,
      target_json_key = excluded.target_json_key,
      is_lineage      = excluded.is_lineage,
      transform       = excluded.transform,
      why_unmapped    = excluded.why_unmapped,
      notes           = excluded.notes;
