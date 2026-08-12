-- Owner, 11 Aug 2026: "I already shared reports over and over at least 20x... update
-- supabase so we can stop with these reports and agents not pulling from supa
-- database where our data should be clean like QuickBooks, Microsoft and Google."
--
-- MEASURED FIRST, AND THE PREMISE WAS WRONG IN A WAY THAT MATTERS. The data IS in
-- Supabase: 15,595 plants, 39,531 lab results, 19,256 package transfers, 7,266
-- point-in-time snapshots, 4,396 waste, 3,773 destroyed, 1,187 items, 209 strains.
-- 103 report files sit in Downloads and the substance of them is already loaded.
--
-- So he has not been resharing because the database is empty. He has been resharing
-- because AGENTS DO NOT CHECK WHAT IS ALREADY THERE - they ask for a file instead of
-- querying, and he has no way to prove them wrong without doing it himself.
--
-- There was no single place answering "what do we hold, how fresh, from which
-- report". brain/INDEX.md describes knowledge, not data. This view is that place, and
-- the charter now requires reading it BEFORE asking a human for a file.

create or replace view public.v_data_inventory as
select 'metrc_plants'                 as table_name, 'Plants - live, by room and phase' as holds,
       (select count(*) from public.metrc_plants)                 as rows_held,
       (select max(synced_at)::date from public.metrc_plants)     as freshest
union all select 'metrc_packages','Packages with tag, quantity, room, lab state',
       (select count(*) from public.metrc_packages), (select max(synced_at)::date from public.metrc_packages)
union all select 'metrc_rpt_lab_results','Lab results per analyte, with lab licence',
       (select count(*) from public.metrc_rpt_lab_results), (select max(imported_at)::date from public.metrc_rpt_lab_results)
union all select 'metrc_rpt_package_transfers','Every package on every manifest',
       (select count(*) from public.metrc_rpt_package_transfers), (select max(imported_at)::date from public.metrc_rpt_package_transfers)
union all select 'metrc_rpt_transfer_manifests','Manifest headers, both directions',
       (select count(*) from public.metrc_rpt_transfer_manifests), (select max(imported_at)::date from public.metrc_rpt_transfer_manifests)
union all select 'metrc_rpt_point_in_time','Dated location snapshots - the location history',
       (select count(*) from public.metrc_rpt_point_in_time), (select max(imported_at)::date from public.metrc_rpt_point_in_time)
union all select 'metrc_rpt_wholesale','Wholesale transfers',
       (select count(*) from public.metrc_rpt_wholesale), (select max(imported_at)::date from public.metrc_rpt_wholesale)
union all select 'metrc_rpt_adjustments','Package adjustments',
       (select count(*) from public.metrc_rpt_adjustments), (select max(imported_at)::date from public.metrc_rpt_adjustments)
union all select 'metrc_rpt_plant_waste','Plant waste',
       (select count(*) from public.metrc_rpt_plant_waste), (select max(imported_at)::date from public.metrc_rpt_plant_waste)
union all select 'metrc_rpt_plants_destroyed','Plants destroyed',
       (select count(*) from public.metrc_rpt_plants_destroyed), (select max(imported_at)::date from public.metrc_rpt_plants_destroyed)
union all select 'metrc_rpt_harvests','Harvest records',
       (select count(*) from public.metrc_rpt_harvests), (select max(imported_at)::date from public.metrc_rpt_harvests)
union all select 'metrc_rpt_harvest_moisture','Moisture loss - the ONLY source; the API has no moisture field',
       (select count(*) from public.metrc_rpt_harvest_moisture), (select max(imported_at)::date from public.metrc_rpt_harvest_moisture)
union all select 'metrc_items','Metrc item catalogue',
       (select count(*) from public.metrc_items), null
union all select 'metrc_strains','Registered strains',
       (select count(*) from public.metrc_strains), null
union all select 'metrc_locations','Rooms and locations',
       (select count(*) from public.metrc_locations), null
union all select 'coa_extract','Parsed COAs',
       (select count(*) from public.coa_extract), (select max(parsed_at)::date from public.coa_extract)
union all select 'manifest_extract','Parsed manifests',
       (select count(*) from public.manifest_extract), null
union all select 'apex_raw','Apex - orders, buyers, products, batches, deal flow',
       (select count(*) from public.apex_raw), (select max(fetched_at)::date from public.apex_raw)
union all select 'product_inventory','Finished-goods spreadsheet, all tabs',
       (select count(*) from public.product_inventory), (select max(synced_at)::date from public.product_inventory)
union all select 'third_party_material','Third-party material held for others',
       (select count(*) from public.third_party_material), (select max(synced_at)::date from public.third_party_material)
union all select 'tag_event','SEED-TO-SALE LEDGER - dwell, custody, testing, location',
       (select count(*) from public.tag_event), (select max(created_at)::date from public.tag_event);

comment on view public.v_data_inventory is
  'WHAT SUPABASE ALREADY HOLDS. Query this BEFORE asking a person for a report file. On 11 Aug 2026 the owner had reshared reports roughly twenty times while 15,595 plants, 39,531 lab results and 19,256 package transfers were already loaded - agents were asking for files instead of querying, and there was no single place to prove the data was there.';

grant select on public.v_data_inventory to authenticated, tg_desktop_reader;

select table_name, rows_held, freshest from public.v_data_inventory
where rows_held > 0 order by rows_held desc limit 12;;
