-- ---------------------------------------------------------------------------
-- 0050 — AUDIT-GRADE DETAIL.
--   1. Every room, every form of inventory: growing, drying, packaged.
--   2. Every pound that left, by tag, to whom, on which manifest, for how much.
-- ---------------------------------------------------------------------------

-- 1 · ROOM CENSUS. Live plants are COUNTS (a growing plant has no packaged weight);
--     drying material is WET weight; packages are their current weight. Keeping the
--     three in separate measure columns stops the classic audit error of adding a
--     wet pound to a cured pound.
create or replace view v_forensic_room_census as
select 'GROWING'::text                                   as stage,
       coalesce(nullif(pl.room,''),'(NO ROOM RECORDED)')  as room,
       coalesce(rr.role,'unmapped')                       as room_role,
       pl.license                                         as licence,
       pl.phase                                           as detail,
       pl.strain                                          as strain,
       count(*)::numeric                                  as plant_count,
       0::numeric                                         as wet_lb,
       0::numeric                                         as packaged_lb,
       true                                               as is_ours,
       'Twisted Growers LLC'::text                        as grown_or_processed_by
from metrc_plants pl
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(pl.room))
group by 1,2,3,4,5,6

union all
select 'DRYING / CURING',
       coalesce(nullif(hm.room,''),'(NO ROOM RECORDED)'),
       coalesce(rr.role,'unmapped'), hm.licence,
       'Harvest ' || hm.harvest_batch, hm.strain,
       coalesce(sum(hm.plants),0)::numeric, coalesce(sum(hm.wet_lb),0)::numeric, 0,
       true, 'Twisted Growers LLC'
from metrc_rpt_harvest_moisture hm
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(hm.room))
where hm.finished_on is null
group by 1,2,3,4,5,6

union all
select 'PACKAGED',
       coalesce(nullif(p.raw->>'LocationName',''),'(NO ROOM RECORDED)'),
       coalesce(rr.role,'unmapped'), p.license,
       coalesce(nullif(p.raw->>'ProductCategoryName',''),'(uncategorised)'),
       f_strain_from_item(p.raw->>'ProductName'),
       0, 0,
       sum(f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0),
             coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))),
       f_is_ours(coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''), p.license)),
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(unknown)')
from metrc_packages p
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(p.raw->>'LocationName'))
where not coalesce((p.raw->>'IsFinished')::boolean,false)
  and f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
  and coalesce((p.raw->>'Quantity')::numeric,0) > 0
group by 1,2,3,4,5,6,10,11;

comment on view v_forensic_room_census is
  'EVERY room and EVERY form of inventory as at the moment of the pull: live plants '
  '(counts), drying/curing harvests (WET lb), and packages (current lb). The three '
  'measures are deliberately in separate columns -- a wet pound and a cured pound are '
  'not the same pound and must never be summed together.';

grant select on v_forensic_room_census to authenticated;


-- 2 · SOLD / SHIPPED, BY TAG. Metrc is authoritative for tag, manifest and weight;
--     Apex is authoritative for the invoice and the money. Joined, never merged.
create or replace view v_forensic_sold_by_tag as
select t.received_on                                   as shipped_on,
       t.manifest_number,
       t.package_tag,
       t.item                                          as item,
       t.category,
       t.strain,
       f_product_line(t.item, t.category, null)         as product_line,
       t.shipped_lb                                    as pounds,
       coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence)   as sold_by_licence,
       t.source_row->>'Origin Facility'                as sold_by_facility,
       t.destination_licence                           as buyer_licence,
       t.destination_facility                          as buyer,
       f_is_ours(t.destination_licence)                as internal_transfer,
       t.status,
       t.source_row->>'Type'                           as transfer_type,
       -- money comes from Apex, matched on manifest first, then buyer licence + date
       a.invoice_number,
       a.total_usd,
       a.payment_status,
       case when a.invoice_number is not null then 'matched' else 'NO APEX INVOICE' end as invoice_match
from metrc_rpt_package_transfers t
left join lateral (
  select s.invoice_number, s.total_usd, s.payment_status
  from v_forensic_sales s
  where not s.cancelled
    and (s.manifest_number = t.manifest_number
         or (s.buyer_licence = t.destination_licence
             and s.order_date between t.received_on - 7 and t.received_on + 7))
  order by (s.manifest_number = t.manifest_number) desc, s.order_date
  limit 1) a on true
where t.shipped_lb is not null and t.shipped_lb <> 0
  and upper(btrim(coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence)))
      in (select upper(btrim(license)) from company_licenses where active);

comment on view v_forensic_sold_by_tag is
  'Every pound that LEFT one of our licences: tag, manifest, buyer, weight, and the '
  'Apex invoice where one matches. Metrc owns tag/manifest/weight; Apex owns the '
  'invoice and the money -- the two are joined for reporting and never merged into a '
  'single source. internal_transfer flags movement to our own other licence, which is '
  'NOT a sale. invoice_match = NO APEX INVOICE is an exception to investigate.';

grant select on v_forensic_sold_by_tag to authenticated;
;
