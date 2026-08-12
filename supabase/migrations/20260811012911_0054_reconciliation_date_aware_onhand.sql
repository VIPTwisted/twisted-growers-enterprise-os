-- ---------------------------------------------------------------------------
-- 0054 — Line 8 was quoting TODAY'S package mirror whatever end date was asked for,
-- which made every historical variance meaningless (the 2024 run reported +1,266.4
-- lb by comparing a 2024 expectation against a 2026 shelf count).
--
-- A counted position exists only where Metrc gave us an Inventory Point in Time
-- export. Where there is none, the function now SAYS SO instead of substituting
-- today's number. The point-in-time report carries no weight column, only tag and
-- location, so weight for a historical date is reconstructed from the event ledger
-- and is labelled as reconstructed.
-- ---------------------------------------------------------------------------
create or replace function f_inventory_reconciliation(
  p_from date,
  p_to   date)
returns table (
  line_no int, section text, line_item text, pounds numeric, source text)
language sql stable as $$
with produced as (
  select coalesce(sum(packaged_lb),0) lb from metrc_rpt_harvest_moisture
  where finished_on between p_from and p_to),
purchased as (
  select coalesce(sum(pounds),0) lb from v_transfer_line
  where direction='INBOUND' and voided<>'True' and received_on between p_from and p_to),
sold as (
  select coalesce(sum(pounds),0) lb from v_transfer_line
  where direction='OUTBOUND' and voided<>'True' and received_on between p_from and p_to),
internal as (
  select coalesce(sum(pounds),0) lb from v_transfer_line
  where direction='INTERNAL' and voided<>'True' and received_on between p_from and p_to),
waste as (
  select coalesce(sum(f_to_pounds(quantity,uom)),0) lb from metrc_rpt_adjustments
  where quantity is not null and f_is_weight(uom) and adjusted_on between p_from and p_to),
-- is p_to close enough to a real snapshot to call the position COUNTED?
snap as (
  select max(as_of_date) d from metrc_rpt_point_in_time
  where as_of_date between p_to and p_to + 2),
counted as (
  select case
    when (select d from snap) is null then null
    when (select d from snap) >= current_date - 2 then
      (select coalesce(sum(f_to_pounds(coalesce((raw->>'Quantity')::numeric,0),
             coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),0)
       from metrc_packages
       where not coalesce((raw->>'IsFinished')::boolean,false)
         and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))
    else (select coalesce(sum(greatest(b.lb,0)),0)
          from (select distinct upper(btrim(tag)) tag from metrc_rpt_point_in_time
                where as_of_date=(select d from snap) and record_type='Package') s
          join (select upper(btrim(package_tag)) tag, sum(lb_delta) lb
                from v_package_events where event_date <= p_to group by 1) b on b.tag=s.tag)
    end lb)
select 1,'IN','Produced from our own harvests', round((select lb from produced)::numeric,1),
       'Metrc harvest report, packaged weight, harvests finished in the window'
union all select 2,'IN','Purchased in from third parties', round((select lb from purchased)::numeric,1),
       'Inbound manifests where the origin is NOT one of our licences'
union all select 3,'IN','TOTAL IN',
       round(((select lb from produced)+(select lb from purchased))::numeric,1),''
union all select 4,'OUT','Sold / shipped out', round(-(select lb from sold)::numeric,1),
       'Outbound manifests where the destination is NOT one of our licences'
union all select 5,'OUT','Waste, destruction, corrections', round((select lb from waste)::numeric,1),
       'Metrc adjustment report, weight-denominated rows only'
union all select 6,'OUT','TOTAL OUT',
       round((-(select lb from sold)+(select lb from waste))::numeric,1),''
union all select 7,'RESULT','Expected on hand at ' || to_char(p_to,'DD Mon YYYY'),
       round(((select lb from produced)+(select lb from purchased)
             -(select lb from sold)+(select lb from waste))::numeric,1),
       'Total in less total out'
union all select 8,'RESULT',
       case when (select lb from counted) is null
            then 'Actual on hand — NO SNAPSHOT FOR THIS DATE'
            else 'Actual on hand, counted' end,
       round((select lb from counted)::numeric,1),
       case when (select lb from counted) is null
            then 'NOT AVAILABLE. Metrc holds no Inventory Point in Time export at this date, '
                 'so no counted position exists and no variance can be stated.'
            when (select d from snap) >= current_date - 2 then 'Every open package in the Metrc package mirror'
            else 'Tags from the Inventory Point in Time snapshot; weight RECONSTRUCTED from the event ledger'
       end
union all select 9,'RESULT',
       case when (select lb from counted) is null then 'VARIANCE — CANNOT BE COMPUTED'
            else 'VARIANCE (unexplained)' end,
       case when (select lb from counted) is null then null
            else round(((select lb from counted)
                 -((select lb from produced)+(select lb from purchased)
                  -(select lb from sold)+(select lb from waste)))::numeric,1) end,
       'Expected NEGATIVE: manufacturing yield loss is real and Metrc never tags it'
union all select 10,'MEMO','Internal MC <-> MP transfers (excluded above)',
       round((select lb from internal)::numeric,1),
       'Same material moving between our own licences. Not a purchase, not a sale.'
order by 1;
$$;

grant execute on function f_inventory_reconciliation to authenticated;
;
