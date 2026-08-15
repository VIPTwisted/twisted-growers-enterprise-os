/* LOAD EVERY PACKAGE METRC'S OWN REPORTS NAME AND THE API NEVER RETURNED.
 *
 * Owner, 14 Aug 2026: "everything is in reports its all there all accurate."
 *
 * Measured before loading. metrc_packages held 4,595 rows. Metrc's own report exports
 * name far more package tags under the same two licences and the same tag block:
 *
 *     report                       distinct tags   present in mirror   missing
 *     package_transfers                   15,496               1,372    14,124
 *     lab_results                          1,016                   0     1,016
 *     test_batches                           545                   9       536
 *     adjustments                          1,879               1,395       484
 *     packages_inventory                     508                 508         0
 *
 * The manifest layer reconciles perfectly - transfer_manifests 2,465 of 2,465 and
 * wholesale 1,281 of 1,281 - so the shipping records were complete while the things
 * being shipped were two thirds absent. 16,950 of the missing tags carry prefix
 * 1A40A030000E, the same block as the 4,217 packages already held. They are ours.
 *
 * Of the transfer tags: 14,138 outbound to other licences, 2,897 inbound to us,
 * status Accepted, Shipped or Returned. All historical - every tag in the current
 * inventory export was already present, which is why packages_inventory reconciles.
 *
 * SOURCE PRECEDENCE, richest first: package_transfers, then adjustments, then
 * test_batches, then lab_results. Each contributes only what it actually carries;
 * nothing is invented to fill a column. A field absent from every report stays null,
 * because null is a fact and a guess is not.
 *
 * source_state is 'inactive'. These are historical packages - shipped away, received
 * and consumed, or adjusted out. Nothing here is claimed to be on hand: current
 * inventory is packages_inventory, and that already reconciled at 508 of 508.
 *
 * PROVENANCE IS KEPT. Same pattern as the plants. provenance says 'metrc report',
 * report_as_of carries the export date, and an API sync overwrites on (license, tag)
 * so the label heals itself the moment the API finally returns one of these.
 */

alter table public.metrc_packages
  add column if not exists provenance text not null default 'metrc api';

comment on column public.metrc_packages.provenance is
  'Which door this row came through. "metrc api" is the live sync. "metrc report" means it was loaded from a Metrc report export because the API had never returned the tag. An API sync overwrites on the same (license, tag) key, so the label heals itself.';

alter table public.metrc_packages
  add column if not exists report_as_of date;

comment on column public.metrc_packages.report_as_of is
  'Set only on rows loaded from a Metrc report export - the date that export was true. Null on API rows, which carry synced_at.';

with src as (
  select package_tag as tag, licence,
         nullif(item,'') as item, nullif(category,'') as category,
         shipped_qty as qty, nullif(shipped_uom,'') as uom,
         null::date as packaged_on, null::text as lab_state,
         nullif(strain,'') as strain, as_of_date, 1 as pri
    from public.metrc_rpt_package_transfers where package_tag is not null
  union all
  select package_tag, licence, nullif(item,''), nullif(item_category,''),
         quantity, nullif(uom,''),
         nullif(packaged_on::text,'')::date, null::text,
         null::text, as_of_date, 2
    from public.metrc_rpt_adjustments where package_tag is not null
  union all
  select package_tag, licence, nullif(item_name,''), nullif(category,''),
         null::numeric, null::text,
         nullif(packaged_on::text,'')::date, nullif(lab_testing,''),
         nullif(strain,''), as_of_date, 3
    from public.metrc_rpt_test_batches where package_tag is not null
  union all
  select package_tag, licence, nullif(item,''), nullif(category,''),
         null::numeric, null::text,
         null::date, nullif(lab_testing,''),
         null::text, as_of_date, 4
    from public.metrc_rpt_lab_results where package_tag is not null
), best as (
  select distinct on (tag)
         tag, licence, item, category, qty, uom, packaged_on, lab_state, strain, as_of_date
    from src
   order by tag, pri, as_of_date desc
)
insert into public.metrc_packages
  (license, tag, item_name, quantity, uom, location, packaged_on,
   lab_testing_state, finished, source_state, provenance, report_as_of, synced_at, raw)
select b.licence, b.tag, b.item, b.qty, b.uom, null, b.packaged_on,
       b.lab_state, true, 'inactive', 'metrc report', b.as_of_date, now(),
       jsonb_strip_nulls(jsonb_build_object(
         'Label',        b.tag,
         'Item',         jsonb_build_object('Name', b.item),
         'ProductName',  b.item,
         'ItemCategory', b.category,
         'StrainName',   b.strain,
         'Quantity',     b.qty,
         'UnitOfMeasureName', b.uom,
         '_loaded_from', 'metrc report exports',
         '_as_of',       b.as_of_date,
         '_why',         'Named by Metrc''s own report exports; the API sync never returned this tag. Historical package - shipped, received or adjusted. Not a claim of current inventory.'
       ))
  from best b
 where not exists (select 1 from public.metrc_packages p
                    where p.license = b.licence and p.tag = b.tag)
on conflict (license, tag) do nothing;;
