-- ---------------------------------------------------------------------------
-- 0044 — MASTER BALANCE, rebuilt on the CORRECTED basis.
--
-- The previous version counted outbound by INNER JOINING package lines to manifest
-- headers. 1,463 lines across 191 manifests have NO header -- all MC281714 -- so
-- every one was silently dropped, understating 2024 outbound by 518.45 lb and
-- producing three false findings before the owner's insistence that nothing leaves
-- a facility without a manifest forced me to test the join rather than the source.
--
-- THE LINES ARE AUTHORITATIVE. metrc_rpt_package_transfers carries manifest_number,
-- destination_licence AND destination_facility on every row, so it never needs the
-- header. transfer_type was the only reason to join, and it is derivable from the
-- destination licence prefix (MT transporter, IL laboratory, ours internal).
--
-- Date basis is the LINE's received_on throughout -- one clock. Mixing the header's
-- created_on with the line's received_on was a second, quieter error.
--
-- Columns keep their original names and order; new measures are APPENDED, because
-- CREATE OR REPLACE forbids renaming a position and the drop guard exists for good
-- reason.
-- ---------------------------------------------------------------------------

create or replace view v_master_balance as
with grown as (
  select extract(year from finished_on)::int as period,
         round(sum(wet_lb),1) as wet_lb, round(sum(waste_lb),1) as waste_lb,
         round(sum(moisture_loss_lb),1) as moisture_lb, round(sum(packaged_lb),1) as packaged_lb,
         round(sum(wet_lb)-sum(waste_lb)-sum(moisture_loss_lb)-sum(packaged_lb),4) as unexplained_lb
  from metrc_rpt_harvest_moisture group by 1
),
bought as (
  select yr as period, round(sum(lb_received),1) as bought_lb
  from v_material_sourcing where ownership like 'THIRD PARTY%' group by 1
),
moved as (   -- LINES ONLY. No header join.
  select extract(year from t.received_on)::int as period,
         round(sum(t.shipped_lb) filter (where t.destination_licence !~* '^(MT|IL)'
                                           and not f_is_ours(coalesce(t.destination_licence,'')))::numeric,1) as arms_length_lb,
         round(sum(t.shipped_lb) filter (where t.destination_licence ~* '^MT')::numeric,1) as to_warehouse_lb,
         round(sum(t.shipped_lb) filter (where t.destination_licence ~* '^IL')::numeric,1) as to_lab_lb,
         round(sum(t.shipped_lb) filter (where f_is_ours(coalesce(t.destination_licence,'')))::numeric,1) as internal_lb,
         count(distinct t.manifest_number) filter (where t.destination_licence !~* '^(MT|IL)'
                                           and not f_is_ours(coalesce(t.destination_licence,''))) as arms_length_manifests,
         count(distinct t.manifest_number) filter (where f_is_ours(coalesce(t.destination_licence,''))) as internal_manifests,
         count(distinct t.manifest_number) filter (where t.destination_licence ~* '^IL') as lab_manifests,
         count(distinct t.manifest_number) as all_manifests,
         count(*)                          as all_lines,
         count(*) filter (where not exists (select 1 from metrc_rpt_transfer_manifests m
                                             where m.manifest_number = t.manifest_number)) as lines_without_a_header
  from metrc_rpt_package_transfers t group by 1
),
lost as (
  select period, round(sum(lb),1) as destroyed_lb from (
    select extract(year from adjusted_on)::int as period, abs(f_to_pounds(quantity,uom)) as lb
      from metrc_rpt_adjustments where quantity < 0
    union all
    select extract(year from waste_date)::int, f_to_pounds(waste_qty,uom)
      from metrc_rpt_plant_waste) z group by 1
),
sold as (
  select extract(year from coalesce((payload->>'order_date')::date,(payload->>'created_at')::date))::int as period,
         count(*) filter (where not (payload->>'cancelled')::boolean)                  as live_orders,
         count(*) filter (where (payload->>'cancelled')::boolean)                      as cancelled_orders,
         round(sum(coalesce((payload->>'total_raw')::numeric,0)/100.0)
               filter (where not (payload->>'cancelled')::boolean),2)                  as revenue_usd,
         round(sum(coalesce((payload->>'total_payments_raw')::numeric,0)/100.0)
               filter (where not (payload->>'cancelled')::boolean),2)                  as collected_usd
  from apex_raw where entity='shipping-orders' group by 1
),
tagged as (
  select extract(year from coalesce((a.payload->>'order_date')::date,(a.payload->>'created_at')::date))::int as period,
         count(*) as apex_lines,
         count(nullif(btrim(it->>'metrc_package_label'),'')) as lines_with_metrc_tag
  from apex_raw a, lateral jsonb_array_elements(a.payload->'items') it
  where a.entity='shipping-orders' and not (a.payload->>'cancelled')::boolean
  group by 1
)
select g.period,
       g.wet_lb, g.waste_lb, g.moisture_lb, g.packaged_lb,
       g.unexplained_lb                                as metrc_mass_unexplained_lb,
       m.arms_length_manifests, m.internal_manifests, m.lab_manifests,
       s.live_orders, s.revenue_usd, s.collected_usd,
       round(coalesce(s.revenue_usd,0)-coalesce(s.collected_usd,0),2) as outstanding_usd,
       s.cancelled_orders,
       t.apex_lines, t.lines_with_metrc_tag,
       case when coalesce(g.unexplained_lb,0)=0 then 'MASS BALANCED — 0.0000 lb'
            else 'MASS UNBALANCED — ' || g.unexplained_lb || ' lb' end          as mass_verdict,
       case when coalesce(s.revenue_usd,0)-coalesce(s.collected_usd,0) = 0
              then 'CASH BALANCED — nothing outstanding'
            else 'OUTSTANDING $' || round(coalesce(s.revenue_usd,0)-coalesce(s.collected_usd,0),2) end as cash_verdict,
       case when coalesce(t.lines_with_metrc_tag,0)=0
              then 'NO TAG LINK — 0 of ' || coalesce(t.apex_lines,0) || ' Apex lines carry a Metrc tag. '
                   || 'Rebuilt on buyer licence + date instead; see v_invoice_manifest_match.'
            else round(100.0*t.lines_with_metrc_tag/nullif(t.apex_lines,0),1) || '% of Apex lines carry a Metrc tag'
       end                                                                       as link_verdict,
       /* ---------- appended: the corrected weight measures ---------- */
       b.bought_lb, m.arms_length_lb, m.to_warehouse_lb, m.to_lab_lb, m.internal_lb,
       l.destroyed_lb, m.all_manifests, m.all_lines, m.lines_without_a_header
from grown g
left join bought b on b.period=g.period
left join moved  m on m.period=g.period
left join lost   l on l.period=g.period
left join sold   s on s.period=g.period
left join tagged t on t.period=g.period;

comment on view v_master_balance is
  'Inventory, Metrc and Apex per year on ONE consistent basis: the transfer LINE, '
  'never an inner join to the manifest header. 1,463 lines have no header and were '
  'silently dropped by the previous version, understating 2024 outbound by 518.45 lb. '
  'lines_without_a_header is exposed so that shortfall can never hide again.';

grant select on v_master_balance to authenticated;
;
