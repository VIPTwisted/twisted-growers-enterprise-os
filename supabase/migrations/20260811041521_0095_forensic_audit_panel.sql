-- ---------------------------------------------------------------------------
-- 0095 — The INVENTORY FORENSIC AUDIT panel: a ledger, not a tile grid.
--
-- Owner 11 Aug 2026: this needs to be its own SECTION, not another tile. A tile
-- shows one number with no arithmetic; an audit has to show the working — what came
-- in, what went out, what is left, and what does not add up — so a reader can follow
-- the line rather than take it on trust.
--
-- Rows are ordered as a schedule and carry a `kind` so the UI can style IN, OUT,
-- RESULT and EXCEPTION differently.
-- ---------------------------------------------------------------------------
create or replace view v_forensic_audit_panel as
with prod as (
  select coalesce(sum(f_to_pounds(coalesce((raw->>'CreatedQuantity')::numeric,0),
        coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),0) lb
  from metrc_packages
  where nullif(raw->>'SourceHarvestNames','') is not null
    and nullif(raw->>'SourcePackageLabels','') is null
    and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),
xf as (
  select coalesce(sum(pounds) filter (where direction='INBOUND'),0) in_lb,
         coalesce(sum(pounds) filter (where direction='OUTBOUND'),0) out_lb,
         coalesce(sum(pounds) filter (where direction='INTERNAL'),0) internal_lb
  from v_transfer_line where voided <> 'True'),
adj as (select coalesce(sum(f_to_pounds(quantity,uom)),0) lb from metrc_rpt_adjustments
        where quantity is not null and f_is_weight(uom)),
oh as (
  select coalesce(sum(f_to_pounds(coalesce((raw->>'Quantity')::numeric,0),
        coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),0) lb
  from metrc_packages where not coalesce((raw->>'IsFinished')::boolean,false)
    and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),
tp as (
  select coalesce(sum(lb_on_hand),0) on_hand,
         coalesce(sum(lb_received) filter (where status like 'UNEXPLAINED%'),0) unexplained,
         coalesce(sum(lb_received) filter (where lab_failures > 0),0) failed,
         coalesce(sum(coalesce(exit_lb,0)+coalesce(lb_sold,0)),0) resold,
         coalesce(sum(exit_sold_usd),0) resold_usd,
         count(*) filter (where status like 'UNEXPLAINED%') unexplained_tags
  from v_third_party_forensic),
spend as (
  select coalesce(sum(nullif(source_row->>'Receiver Wholesale Price','')::numeric),0) usd
  from metrc_rpt_package_transfers t
  where f_is_ours(coalesce(nullif(t.source_row->>'Dest. Lic.',''), t.destination_licence))
    and not f_is_ours(coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence))
    and coalesce(t.source_row->>'Voided','False') <> 'True'),
noinv as (
  select count(*) n, coalesce(sum(pounds),0) lb from v_forensic_sold_by_tag
  where invoice_match='NO APEX INVOICE' and not internal_transfer),
cert as (select count(*) n from mv_tag_certificate where certificate_source is null)
select 1 ord, 'IN'::text kind, 'Produced from our own harvests'::text line,
       round((select lb from prod)::numeric,1) lb, null::numeric usd,
       'Packages made straight off a harvest, dated on the package''s own PackagedDate'::text basis,
       'forensic_reconciliation'::text drill
union all select 2,'IN','Purchased from third parties', round((select in_lb from xf)::numeric,1),
       round((select usd from spend)::numeric,0),
       'Inbound manifests. Cost is the manifests'' own Receiver Wholesale Price — what we actually paid',
       'third_party_forensic'
union all select 3,'OUT','Sold and shipped out', round(-(select out_lb from xf)::numeric,1), null,
       'Outbound manifests where the destination is not one of our licences','forensic_sold_by_tag'
union all select 4,'OUT','Waste, destruction and corrections', round((select lb from adj)::numeric,1), null,
       'Metrc adjustment report, weight-denominated rows only','destroyed_unexplained'
union all select 5,'RESULT','Expected on hand',
       round(((select lb from prod)+(select in_lb from xf)-(select out_lb from xf)+(select lb from adj))::numeric,1),
       null,'Everything in, less everything out','forensic_reconciliation'
union all select 6,'RESULT','Counted on hand', round((select lb from oh)::numeric,1), null,
       'Every open package in the Metrc mirror','forensic_position'
union all select 7,'RESULT','VARIANCE',
       round(((select lb from oh)-((select lb from prod)+(select in_lb from xf)
              -(select out_lb from xf)+(select lb from adj)))::numeric,1), null,
       'Expected NEGATIVE — manufacturing yield loss is real and Metrc never tags it','forensic_reconciliation'
union all select 8,'MEMO','Internal MC ↔ MP transfers', round((select internal_lb from xf)::numeric,1), null,
       'Our own material between our own licences. Neither a sale nor a purchase','forensic_sold_by_tag'
union all select 10,'EXCEPTION','Third-party UNEXPLAINED',
       round((select unexplained from tp)::numeric,1), null,
       (select unexplained_tags || ' tags with a manifest and a COA but no recorded outcome' from tp),
       'third_party_forensic'
union all select 11,'EXCEPTION','Shipped with no Apex invoice',
       round((select lb from noinv)::numeric,1), null,
       (select n || ' outbound lines with no matching invoice. Apex is the record of truth for sales' from noinv),
       'forensic_sold_by_tag'
union all select 12,'EXCEPTION','Tags with no certificate imported', (select n from cert)::numeric, null,
       'Nothing ships without a COA — these are holes in our import, not compliance failures',
       'tag_coa_gap'
union all select 20,'THIRD PARTY','On hand', round((select on_hand from tp)::numeric,1), null,
       'Purchased material still in our rooms','third_party_forensic'
union all select 21,'THIRD PARTY','Resold at markup', round((select resold from tp)::numeric,1),
       round((select resold_usd from tp)::numeric,0),
       'Traced through the child tag on the outbound manifest','third_party_forensic'
union all select 22,'THIRD PARTY','Failed then remediated', round((select failed from tp)::numeric,1), null,
       'Failed material is remediated and processed on. NOT a compliance issue','third_party_forensic'
order by 1;

comment on view v_forensic_audit_panel is
  'The Inventory Forensic Audit section: a schedule, not a tile grid. Shows the '
  'working — in, out, expected, counted, variance — plus the live exceptions, so a '
  'reader can follow the arithmetic instead of taking one number on trust.';

grant select on v_forensic_audit_panel to authenticated;
;
