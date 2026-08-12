-- ---------------------------------------------------------------------------
-- 0057 — Add the OPENING balance. Without it each year was computed in isolation
-- and FY2025 reported expected inventory of -1,852.9 lb, a negative physical
-- quantity, which is impossible and would fail any accountant's first read.
-- Opening is accumulated from inception (first package 2023-10-09) to the day
-- before the window, from the same five sources, so the schedule now reads
-- opening + in - out = expected closing and is additive year on year.
-- ---------------------------------------------------------------------------
create or replace function f_inventory_reconciliation(
  p_from date,
  p_to   date)
returns table (
  line_no int, section text, line_item text, pounds numeric, source text)
language sql stable as $$
with inception as (select date '2023-01-01' d),
flows as (
  select
    (select coalesce(sum(packaged_lb),0) from metrc_rpt_harvest_moisture
       where finished_on between (select d from inception) and p_from - 1)
   +(select coalesce(sum(pounds),0) from v_transfer_line
       where direction='INBOUND' and voided<>'True'
         and received_on between (select d from inception) and p_from - 1)
   -(select coalesce(sum(pounds),0) from v_transfer_line
       where direction='OUTBOUND' and voided<>'True'
         and received_on between (select d from inception) and p_from - 1)
   +(select coalesce(sum(f_to_pounds(quantity,uom)),0) from metrc_rpt_adjustments
       where quantity is not null and f_is_weight(uom)
         and adjusted_on between (select d from inception) and p_from - 1)  as opening,
    (select coalesce(sum(packaged_lb),0) from metrc_rpt_harvest_moisture
       where finished_on between p_from and p_to)                          as produced,
    (select coalesce(sum(pounds),0) from v_transfer_line
       where direction='INBOUND' and voided<>'True' and received_on between p_from and p_to) as purchased,
    (select coalesce(sum(pounds),0) from v_transfer_line
       where direction='OUTBOUND' and voided<>'True' and received_on between p_from and p_to) as sold,
    (select coalesce(sum(pounds),0) from v_transfer_line
       where direction='INTERNAL' and voided<>'True' and received_on between p_from and p_to) as internal,
    (select coalesce(sum(f_to_pounds(quantity,uom)),0) from metrc_rpt_adjustments
       where quantity is not null and f_is_weight(uom) and adjusted_on between p_from and p_to) as waste),
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
            from metrc_packages
            where not coalesce((raw->>'IsFinished')::boolean,false)
              and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))
         when (select d from snap) is null then null
         else (select lb from recon) end lb),
expected as (select (select opening+produced+purchased-sold+waste from flows) lb)
select 0,'OPENING','On hand at close of ' || to_char(p_from - 1,'DD Mon YYYY'),
       round((select opening from flows)::numeric,1),
       'Accumulated from inception to the day before this window, same five sources'
union all select 1,'IN','Produced from our own harvests', round((select produced from flows)::numeric,1),
       'Metrc harvest report, packaged weight, harvests finished in the window'
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
                 || ' snapshot tags carry a ledger weight; the rest are counted as tags but not as pounds.'
       end
union all select 9,'RESULT',
       case when (select lb from counted) is null then 'VARIANCE — CANNOT BE COMPUTED'
            else 'VARIANCE (unexplained)' end,
       case when (select lb from counted) is null then null
            else round(((select lb from counted)-(select lb from expected))::numeric,1) end,
       'Expected NEGATIVE: manufacturing yield loss is real and Metrc never tags it'
union all select 10,'MEMO','Internal MC <-> MP transfers (excluded above)',
       round((select internal from flows)::numeric,1),
       'Same material moving between our own licences. Not a purchase, not a sale.'
order by 1;
$$;

grant execute on function f_inventory_reconciliation to authenticated;
;
