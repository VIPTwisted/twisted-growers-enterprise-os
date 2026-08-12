-- ---------------------------------------------------------------------------
-- 0052 — THE RECONCILIATION. Five independent sources, no identity.
--
-- Sources, deliberately different so the schedule CAN fail:
--   produced   metrc_rpt_harvest_moisture.packaged_lb  (harvest report)
--   purchased  v_transfer_line INBOUND                 (inbound manifests)
--   sold       v_transfer_line OUTBOUND                (outbound manifests)
--   waste      metrc_rpt_adjustments                   (adjustment report)
--   on hand    metrc_packages                          (package mirror)
--
-- Internal MC <-> MP legs are EXCLUDED: the same physical material moving between
-- our own two licences is not a purchase and not a sale, and counting it as either
-- double-counts it.
--
-- NOT built on the package mirror: that mirror holds 4,343 tags while the transfer
-- report references 15,496, so a mirror-keyed balance cannot see most shipments.
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
onhand as (
  select coalesce(sum(f_to_pounds(coalesce((raw->>'Quantity')::numeric,0),
        coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),0) lb
  from metrc_packages
  where not coalesce((raw->>'IsFinished')::boolean,false)
    and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))
select 1,'IN','Produced from our own harvests',   round((select lb from produced)::numeric,1),
       'Metrc harvest report, packaged weight, harvests finished in the window'
union all select 2,'IN','Purchased in from third parties', round((select lb from purchased)::numeric,1),
       'Inbound manifests where the origin is NOT one of our licences'
union all select 3,'IN','TOTAL IN',
       round(((select lb from produced)+(select lb from purchased))::numeric,1),''
union all select 4,'OUT','Sold / shipped out',      round(-(select lb from sold)::numeric,1),
       'Outbound manifests where the destination is NOT one of our licences'
union all select 5,'OUT','Waste, destruction, corrections', round((select lb from waste)::numeric,1),
       'Metrc adjustment report, weight-denominated rows only'
union all select 6,'OUT','TOTAL OUT',
       round((-(select lb from sold)+(select lb from waste))::numeric,1),''
union all select 7,'RESULT','Expected on hand at ' || to_char(p_to,'DD Mon YYYY'),
       round(((select lb from produced)+(select lb from purchased)
             -(select lb from sold)+(select lb from waste))::numeric,1),
       'Total in less total out'
union all select 8,'RESULT','Actual on hand, counted',  round((select lb from onhand)::numeric,1),
       'Sum of every open package in the Metrc package mirror'
union all select 9,'RESULT','VARIANCE (unexplained)',
       round(((select lb from onhand)
            -((select lb from produced)+(select lb from purchased)
             -(select lb from sold)+(select lb from waste)))::numeric,1),
       'Expected to be NEGATIVE: manufacturing yield loss is real and Metrc never tags it'
union all select 10,'MEMO','Internal MC <-> MP transfers (excluded above)',
       round((select lb from internal)::numeric,1),
       'Same material moving between our own licences. Not a purchase, not a sale.'
order by 1;
$$;

comment on function f_inventory_reconciliation is
  'Inventory reconciliation for any date range from FIVE independent sources. This '
  'is NOT an identity: every line is sourced differently, so the variance on line 9 '
  'is a real measurement and can be non-zero. Contrast the harvest moisture figure '
  '(wet - waste - packaged = moisture loss), which closes to 0.0000 by definition, '
  'would close on fabricated numbers, and must never be quoted as a reconciliation.';

grant execute on function f_inventory_reconciliation to authenticated;
;
