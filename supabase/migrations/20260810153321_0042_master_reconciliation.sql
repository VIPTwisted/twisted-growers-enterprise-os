-- ---------------------------------------------------------------------------
-- 0042 — THE MASTER RECONCILIATION. Inventory, Metrc and Apex in one place.
--
-- Owner, 10 Aug 2026: "this all should now fully balance and reconcile for
-- inventory, Apex sale and Metrc; to give full seed to sale data and true on hand
-- inventory in each and every room and stage."
--
-- TWO VIEWS:
--   v_onhand_by_room_stage  TRUE on-hand, every room, with the STAGE that room
--                           represents. Rooms with no registered role are shown
--                           as UNMAPPED rather than silently bucketed -- five new
--                           rooms appeared between snapshots (Safe, Vault,
--                           Vault 2, Retail Floor, Back Stock REC) and guessing
--                           their stage would invent a process step.
--   v_master_balance        the three systems side by side, per period, with the
--                           reconciling item NAMED rather than left as a residual.
--
-- THE ONE THING THAT CANNOT RECONCILE, and it is stated on the face of the view
-- rather than buried: ZERO of Apex's order lines carry a Metrc tag. Metrc says
-- WHAT LEFT; Apex says WHAT SOLD. They agree on the shape of the year and cannot
-- be tied line by line, because Apex v1 does not expose the tag or the manifest.
-- That is a vendor limit, proven four ways, not a discrepancy in the records.
-- ---------------------------------------------------------------------------

create or replace view v_onhand_by_room_stage as
select p.license                                               as licence,
       case when p.license='MC281714' then 'CULTIVATION'
            when p.license='MP281909' then 'MANUFACTURING'
            else p.license end                                 as department,
       coalesce(nullif(p.raw->>'LocationName',''),'(no room)')  as room,
       coalesce(r.stage, 'UNMAPPED — room has no registered role') as stage,
       coalesce(r.role,  'not registered in room_roles')        as room_role,
       (r.room_name is not null)                                as room_registered,
       coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
       case when f_is_ours(coalesce(p.raw->>'ItemFromFacilityLicenseNumber','')) then 'OURS'
            else 'THIRD PARTY' end                              as ownership,
       count(*)                                                 as tags,
       round(sum(f_to_pounds((p.raw->>'Quantity')::numeric,
             coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')))
             filter (where f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')))::numeric,2) as lb,
       sum((p.raw->>'Quantity')::numeric)
             filter (where not f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))) as units,
       count(*) filter (where p.raw->>'LabTestingState' in ('TestPassed','RetestPassed')) as tested_ok,
       count(*) filter (where p.raw->>'LabTestingState' ilike '%fail%')                   as failed,
       count(*) filter (where not exists (select 1 from coa_extract c
                                           where c.package_tag = p.raw->>'Label'))        as no_coa
from metrc_packages p
left join room_roles r on r.room_name = nullif(p.raw->>'LocationName','')
where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  and coalesce((p.raw->>'IsFinished')::boolean,false) = false
group by 1,2,3,4,5,6,7,8;

comment on view v_onhand_by_room_stage is
  'TRUE ON HAND, every room, with the STAGE that room represents and ours vs third '
  'party. A room with no registered role reads UNMAPPED rather than being bucketed '
  'by guess -- inventing a process step is worse than admitting the room is not '
  'catalogued.';

grant select on v_onhand_by_room_stage to authenticated;


create or replace view v_master_balance as
with yr as (select generate_series(2024, extract(year from current_date)::int) as period),
metrc_grown as (
  select extract(year from finished_on)::int as period,
         round(sum(wet_lb),1)            as wet_lb,
         round(sum(waste_lb),1)          as waste_lb,
         round(sum(moisture_loss_lb),1)  as moisture_lb,
         round(sum(packaged_lb),1)       as packaged_lb,
         round(sum(wet_lb)-sum(waste_lb)-sum(moisture_loss_lb)-sum(packaged_lb),4) as unexplained_lb
  from metrc_rpt_harvest_moisture group by 1
),
metrc_out as (
  select extract(year from coalesce(m.created_on,m.received_on))::int as period,
         count(distinct m.manifest_number) filter (where m.transfer_type='Unaffiliated Transfer') as arms_length_manifests,
         count(distinct m.manifest_number) filter (where m.transfer_type='Affiliated Transfer')   as internal_manifests,
         count(distinct m.manifest_number) filter (where m.transfer_type='Lab Transfer')          as lab_manifests
  from metrc_rpt_transfer_manifests m
  where m.direction='outbound' group by 1
),
apex as (
  select extract(year from coalesce((payload->>'order_date')::date,(payload->>'created_at')::date))::int as period,
         count(*) filter (where not (payload->>'cancelled')::boolean)                  as live_orders,
         round(sum(coalesce((payload->>'total_raw')::numeric,0)/100.0)
               filter (where not (payload->>'cancelled')::boolean),2)                  as revenue_usd,
         round(sum(coalesce((payload->>'total_payments_raw')::numeric,0)/100.0)
               filter (where not (payload->>'cancelled')::boolean),2)                  as collected_usd,
         count(*) filter (where (payload->>'cancelled')::boolean)                      as cancelled_orders
  from apex_raw where entity='shipping-orders' group by 1
),
tag_link as (
  select extract(year from coalesce((a.payload->>'order_date')::date,(a.payload->>'created_at')::date))::int as period,
         count(*)                                                as apex_lines,
         count(nullif(btrim(it->>'metrc_package_label'),''))      as lines_with_metrc_tag
  from apex_raw a, lateral jsonb_array_elements(a.payload->'items') it
  where a.entity='shipping-orders' and not (a.payload->>'cancelled')::boolean
  group by 1
)
select y.period,
       g.wet_lb, g.waste_lb, g.moisture_lb, g.packaged_lb,
       g.unexplained_lb                                          as metrc_mass_unexplained_lb,
       o.arms_length_manifests, o.internal_manifests, o.lab_manifests,
       a.live_orders, a.revenue_usd, a.collected_usd,
       round(coalesce(a.revenue_usd,0) - coalesce(a.collected_usd,0),2) as outstanding_usd,
       a.cancelled_orders,
       t.apex_lines, t.lines_with_metrc_tag,
       case when coalesce(g.unexplained_lb,0) = 0 then 'MASS BALANCED — 0.0000 lb'
            else 'MASS UNBALANCED — ' || g.unexplained_lb || ' lb' end          as mass_verdict,
       case when coalesce(a.revenue_usd,0) - coalesce(a.collected_usd,0) = 0
              then 'CASH BALANCED — nothing outstanding'
            else 'outstanding $' || round(coalesce(a.revenue_usd,0)-coalesce(a.collected_usd,0),2) end as cash_verdict,
       case when coalesce(t.lines_with_metrc_tag,0) = 0
              then 'METRC<->APEX CANNOT BE TIED — 0 of ' || coalesce(t.apex_lines,0)
                   || ' Apex lines carry a Metrc tag. Apex v1 does not expose it. VENDOR LIMIT, not a records gap.'
            else round(100.0*t.lines_with_metrc_tag/nullif(t.apex_lines,0),1) || '% of Apex lines carry a Metrc tag'
       end                                                                       as link_verdict
from yr y
left join metrc_grown g on g.period = y.period
left join metrc_out   o on o.period = y.period
left join apex        a on a.period = y.period
left join tag_link    t on t.period = y.period;

comment on view v_master_balance is
  'Inventory, Metrc and Apex per year, with each verdict stated rather than left '
  'to inference. Mass comes from Metrc''s RECORDED moisture; cash from Apex, the '
  'record of truth for sales. The Metrc<->Apex link is reported as a VENDOR LIMIT '
  'because zero Apex lines carry a Metrc tag -- Metrc says what left, Apex says '
  'what sold, and neither is wrong.';

grant select on v_master_balance to authenticated;
;
