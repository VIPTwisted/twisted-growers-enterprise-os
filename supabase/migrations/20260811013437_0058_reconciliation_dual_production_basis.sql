-- ---------------------------------------------------------------------------
-- 0058 — Production has TWO defensible measurements and they disagree by 2,424 lb.
--
--   package-created  sum of CreatedQuantity on packages made directly off a harvest,
--                    dated on the package's own PackagedDate. An EVENT with a real
--                    date. 13,713.5 lb.
--   harvest report   metrc_rpt_harvest_moisture.packaged_lb, dated on finished_on.
--                    A per-harvest field whose date is when the harvest was CLOSED,
--                    not when packages were made. 11,289.1 lb.
--
-- Dating by harvest finish drove FY2025 to -570.9 lb expected inventory -- a
-- negative physical quantity -- because material packaged in December ships before
-- its harvest is closed in January.
--
-- The schedule now runs on package-created (event-dated, ties to the tag ledger) and
-- carries the harvest-report figure as a MEMO with the difference stated. Neither is
-- hidden. This difference is the "485.1 lb gap" and it is systematic, not timing:
-- 2024 +485.1, 2025 +284.7, 2026 +1,103.9, plus 550.6 lb of 2023 production that
-- the harvest report does not cover at all.
-- ---------------------------------------------------------------------------
create or replace function f_inventory_reconciliation(
  p_from date,
  p_to   date)
returns table (
  line_no int, section text, line_item text, pounds numeric, source text)
language sql stable as $$
with inception as (select date '2023-01-01' d),
prod as (
  select coalesce(sum(f_to_pounds(coalesce((p.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))),0) lb,
         (p.raw->>'PackagedDate')::date d
  from metrc_packages p
  where nullif(p.raw->>'SourceHarvestNames','') is not null
    and nullif(p.raw->>'SourcePackageLabels','') is null
    and f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
  group by 2),
flows as (
  select
    (select coalesce(sum(lb),0) from prod where d between (select d from inception) and p_from-1)
   +(select coalesce(sum(pounds),0) from v_transfer_line where direction='INBOUND'
       and voided<>'True' and received_on between (select d from inception) and p_from-1)
   -(select coalesce(sum(pounds),0) from v_transfer_line where direction='OUTBOUND'
       and voided<>'True' and received_on between (select d from inception) and p_from-1)
   +(select coalesce(sum(f_to_pounds(quantity,uom)),0) from metrc_rpt_adjustments
       where quantity is not null and f_is_weight(uom)
         and adjusted_on between (select d from inception) and p_from-1)          as opening,
    (select coalesce(sum(lb),0) from prod where d between p_from and p_to)        as produced,
    (select coalesce(sum(packaged_lb),0) from metrc_rpt_harvest_moisture
       where finished_on between p_from and p_to)                                 as produced_hr,
    (select coalesce(sum(pounds),0) from v_transfer_line where direction='INBOUND'
       and voided<>'True' and received_on between p_from and p_to)                as purchased,
    (select coalesce(sum(pounds),0) from v_transfer_line where direction='OUTBOUND'
       and voided<>'True' and received_on between p_from and p_to)                as sold,
    (select coalesce(sum(pounds),0) from v_transfer_line where direction='INTERNAL'
       and voided<>'True' and received_on between p_from and p_to)                as internal,
    (select coalesce(sum(f_to_pounds(quantity,uom)),0) from metrc_rpt_adjustments
       where quantity is not null and f_is_weight(uom)
         and adjusted_on between p_from and p_to)                                 as waste),
live as (select p_to >= current_date - 7 as use_mirror),
snap as (select max(as_of_date) d from metrc_rpt_point_in_time where as_of_date <= p_to + 2),
snapcov as (select count(*) tags, string_agg(distinct licence,' + ') lic_list
  from metrc_rpt_point_in_time where as_of_date=(select d from snap) and record_type='Package'),
recon as (
  select coalesce(sum(greatest(b.lb,0)),0) lb, count(*) weighable
  from (select distinct upper(btrim(tag)) tag from metrc_rpt_point_in_time
        where as_of_date=(select d from snap) and record_type='Package') s
  join (select upper(btrim(package_tag)) tag, sum(lb_delta) lb
        from v_package_events where event_date <= p_to group by 1) b on b.tag=s.tag),
counted as (
  select case when (select use_mirror from live) then
           (select coalesce(sum(f_to_pounds(coalesce((raw->>'Quantity')::numeric,0),
                  coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),0)
            from metrc_packages where not coalesce((raw->>'IsFinished')::boolean,false)
              and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))
         when (select d from snap) is null then null
         else (select lb from recon) end lb),
expected as (select (select opening+produced+purchased-sold+waste from flows) lb)
select 0,'OPENING','On hand at close of ' || to_char(p_from-1,'DD Mon YYYY'),
       round((select opening from flows)::numeric,1),
       'Accumulated from inception on the same five sources'
union all select 1,'IN','Produced from our own harvests', round((select produced from flows)::numeric,1),
       'Packages made directly off a harvest, dated on the package''s own PackagedDate'
union all select 2,'IN','Purchased in from third parties', round((select purchased from flows)::numeric,1),
       'Inbound manifests where the origin is NOT one of our licences'
union all select 3,'IN','TOTAL IN', round((select produced+purchased from flows)::numeric,1),''
union all select 4,'OUT','Sold / shipped out', round(-(select sold from flows)::numeric,1),
       'Outbound manifests where the destination is NOT one of our licences'
union all select 5,'OUT','Waste, destruction, corrections', round((select waste from flows)::numeric,1),
       'Metrc adjustment report, weight-denominated rows only'
union all select 6,'OUT','TOTAL OUT', round((select -sold+waste from flows)::numeric,1),''
union all select 7,'RESULT','Expected on hand at ' || to_char(p_to,'DD Mon YYYY'),
       round((select lb from expected)::numeric,1), 'Opening plus total in less total out'
union all select 8,'RESULT',
       case when (select lb from counted) is null then 'Actual on hand — NO SNAPSHOT AT THIS DATE'
            else 'Actual on hand, counted' end,
       round((select lb from counted)::numeric,1),
       case when (select lb from counted) is null
              then 'Metrc holds no Inventory Point in Time export at or before this date.'
            when (select use_mirror from live) then 'Every open package in the live Metrc package mirror'
            else 'Snapshot ' || (select d from snap) || ' covering licence(s) ' || (select lic_list from snapcov)
                 || '. ' || (select weighable from recon) || ' of ' || (select tags from snapcov)
                 || ' snapshot tags carry a ledger weight; the rest are counted as tags but not as pounds.' end
union all select 9,'RESULT',
       case when (select lb from counted) is null then 'VARIANCE — CANNOT BE COMPUTED'
            else 'VARIANCE (unexplained)' end,
       case when (select lb from counted) is null then null
            else round(((select lb from counted)-(select lb from expected))::numeric,1) end,
       'Expected NEGATIVE: manufacturing yield loss is real and Metrc never tags it'
union all select 10,'MEMO','Internal MC <-> MP transfers (excluded above)',
       round((select internal from flows)::numeric,1),
       'Same material moving between our own licences. Not a purchase, not a sale.'
union all select 11,'MEMO','Production per HARVEST REPORT (alternative basis)',
       round((select produced_hr from flows)::numeric,1),
       'metrc_rpt_harvest_moisture.packaged_lb dated on finished_on. Dating production '
       'by harvest CLOSURE rather than package creation drove FY2025 to a negative '
       'expected inventory, which is why line 1 is used instead.'
union all select 12,'MEMO','Difference between the two production bases',
       round((select produced - produced_hr from flows)::numeric,1),
       'Line 1 less line 11. Systematic, not a December/January timing effect: it is '
       'positive in every year. This is the gap previously reported as 485.1 lb for 2024.'
order by 1;
$$;

grant execute on function f_inventory_reconciliation to authenticated;
;
