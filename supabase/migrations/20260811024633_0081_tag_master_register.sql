-- ---------------------------------------------------------------------------
-- 0081 — THE TAG REGISTER. Every tag we have ever touched, with its manifests and
-- its certificate of analysis.
--
-- 18,468 tags from SEVEN sources, because no single source holds them all: package
-- mirror 4,343, transfer report 15,496, point-in-time 811, inventory report 508, lab
-- results 1,016, COA extracts 969, adjustments 1,879. Building this off
-- metrc_packages alone -- as every earlier attempt did -- misses three quarters.
--
-- Owner 11 Aug 2026: "WE BUY AND SELL FROM OTHER MANUFACTURERS". A two-way flow with
-- a counterparty is ordinary trade, NOT a storage arrangement, so direction cannot be
-- inferred from the counterparty. It must be read per TAG, per MANIFEST - which is
-- exactly what this register does.
--
-- COA is the SOURCE OF RECORD for anything lab-related. Metrc lab fields are a
-- labelled fallback. metrc_rpt_lab_results.overall_passed is TEXT, not boolean.
-- ---------------------------------------------------------------------------
create or replace view v_tag_master as
with universe as (
  select distinct upper(btrim(raw->>'Label')) tag from metrc_packages
  union select distinct upper(btrim(package_tag)) from metrc_rpt_package_transfers
  union select distinct upper(btrim(tag)) from metrc_rpt_point_in_time where record_type='Package'
  union select distinct upper(btrim(package_tag)) from metrc_rpt_packages_inventory
  union select distinct upper(btrim(package_tag)) from metrc_rpt_lab_results where package_tag is not null
  union select distinct upper(btrim(package_tag)) from coa_extract where package_tag is not null
  union select distinct upper(btrim(package_tag)) from metrc_rpt_adjustments where package_tag is not null),
pkg as (
  select upper(btrim(raw->>'Label')) tag, license, raw,
         row_number() over (partition by upper(btrim(raw->>'Label'))
                            order by (raw->>'LastModified') desc nulls last) rn
  from metrc_packages),
xfer_item as (
  select upper(btrim(package_tag)) tag, max(item) item, max(category) category, max(strain) strain
  from metrc_rpt_package_transfers group by 1),
inbound as (
  select upper(btrim(package_tag)) tag,
         string_agg(distinct manifest_number, ', ') manifests,
         min(received_on) first_received,
         string_agg(distinct coalesce(origin_facility, origin_licence), ', ') froms,
         round(sum(pounds)::numeric,3) lb
  from v_transfer_line where direction in ('INBOUND','INTERNAL') and voided<>'True' group by 1),
outbound as (
  select upper(btrim(package_tag)) tag,
         string_agg(distinct manifest_number, ', ') manifests,
         max(received_on) last_shipped,
         string_agg(distinct coalesce(dest_facility, dest_licence), ', ') tos,
         round(sum(pounds)::numeric,3) lb
  from v_transfer_line where direction in ('OUTBOUND','INTERNAL') and voided<>'True' group by 1),
coa as (
  select upper(btrim(package_tag)) tag, count(*) n_coa,
         max(document_id) document_id, max(report_date)::text report_date,
         max(total_thc) total_thc, max(total_cbd) total_cbd,
         max(total_terpenes) total_terpenes, max(total_cannabinoids) total_cannabinoids,
         max(client_name) coa_client, max(client_license) coa_client_licence,
         max(manifest_on_coa) manifest_on_coa, max(sample_id) sample_id
  from coa_extract where package_tag is not null group by 1),
lab as (
  select upper(btrim(package_tag)) tag, count(*) n_lab,
         max(test_date)::text last_test,
         bool_or(lower(coalesce(overall_passed,'')) in ('false','fail','failed','no')) any_fail
  from metrc_rpt_lab_results where package_tag is not null group by 1),
pit as (
  select upper(btrim(tag)) tag,
         string_agg(distinct as_of_date::text || ' @ ' || coalesce(location,'(no room)'), ' | ') snapshots
  from metrc_rpt_point_in_time where record_type='Package' group by 1)
select u.tag,
       coalesce(p.raw->'Item'->>'Name', xi.item)                             as item,
       coalesce(nullif(p.raw->'Item'->>'ProductCategoryName',''), xi.category,'(unknown)') as category,
       coalesce(nullif(p.raw->'Item'->>'StrainName',''), xi.strain,
                f_strain_from_item(p.raw->'Item'->>'Name'))                  as strain,
       p.license                                                             as licence,
       case when p.raw is null then 'UNKNOWN — tag not in package mirror'
            when f_is_ours(coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''),'')) then 'OURS'
            else 'THIRD PARTY' end                                           as ownership,
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(unknown)')       as grown_or_processed_by,
       coalesce(nullif(p.raw->>'LocationName',''),'(no room)')               as room,
       (p.raw->>'PackagedDate')::date                                        as packaged_on,
       coalesce((p.raw->>'IsFinished')::boolean,false)                       as finished,
       (p.raw->>'FinishedDate')::date                                        as finished_on,
       case when p.raw is null then null
            else round(f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0),
                 coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) end as on_hand_lb,
       nullif(p.raw->>'SourceHarvestNames','')                               as source_harvests,
       nullif(p.raw->>'SourcePackageLabels','')                              as source_packages,
       ib.manifests as manifests_in, ib.froms as received_from, ib.first_received,
       ob.manifests as manifests_out, ob.tos as shipped_to, ob.last_shipped, ob.lb as shipped_lb,
       c.document_id as coa_document, c.report_date as coa_report_date,
       c.total_thc, c.total_cbd, c.total_terpenes, c.total_cannabinoids,
       c.coa_client, c.coa_client_licence, c.manifest_on_coa, c.sample_id,
       case when c.tag is not null then 'COA MATCHED ON TAG'
            when l.tag is not null then 'NO COA — Metrc lab result only'
            else 'NO COA AND NO LAB RESULT' end                              as coa_status,
       l.n_lab as metrc_lab_rows, l.last_test as metrc_last_test, l.any_fail as metrc_any_fail,
       pit.snapshots as point_in_time_history,
       concat_ws(' + ',
         case when p.raw   is not null then 'package mirror' end,
         case when ib.tag  is not null then 'inbound manifest' end,
         case when ob.tag  is not null then 'outbound manifest' end,
         case when c.tag   is not null then 'COA' end,
         case when l.tag   is not null then 'Metrc lab' end,
         case when pit.tag is not null then 'point-in-time' end)             as known_from,
       case
         when p.raw is null and ob.tag is not null then 'SHIPPED — no package record held'
         when p.raw is null                        then 'NOT IN PACKAGE MIRROR'
         when coalesce((p.raw->>'IsFinished')::boolean,false) and ob.tag is not null then 'CLOSED — shipped out'
         when coalesce((p.raw->>'IsFinished')::boolean,false) then 'CLOSED — consumed or adjusted'
         when ob.tag is not null                   then 'OPEN — partially shipped'
         else 'ON HAND' end                                                  as tag_status
from universe u
left join pkg p        on p.tag  = u.tag and p.rn = 1
left join xfer_item xi on xi.tag = u.tag
left join inbound ib   on ib.tag = u.tag
left join outbound ob  on ob.tag = u.tag
left join coa c        on c.tag  = u.tag
left join lab l        on l.tag  = u.tag
left join pit          on pit.tag = u.tag;

comment on view v_tag_master is
  'EVERY tag, with its inbound and outbound manifests, counterparties, and COA. We buy '
  'AND sell with other manufacturers, so a two-way flow is ordinary trade and direction '
  'can only be read per TAG per MANIFEST — never inferred from the counterparty.';

grant select on v_tag_master to authenticated;

-- Those counterparties are traders, not warehouses. Correct the auto-listed guesses.
update counterparty_role
   set role='CUSTOMER', counts_as_sale=true, counts_as_purchase=true,
       note = 'Owner 11 Aug 2026: "WE BUY AND SELL FROM OTHER MANUFACTURERS." A balanced '
              'two-way flow with this counterparty is ORDINARY TRADE, not storage. Both '
              'legs count. Direction is read per tag per manifest.',
       updated_at = now()
 where role = 'UNCLASSIFIED';
;
