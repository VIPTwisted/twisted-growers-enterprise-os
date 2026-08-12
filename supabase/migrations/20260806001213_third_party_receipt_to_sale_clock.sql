-- Third party material from the manifest that brought it in, through processing,
-- to the manifest that sold it. Every stage timed.
drop view if exists v_third_party_lifecycle cascade;
create view v_third_party_lifecycle as
with inbound as (
  select
    p.tag, p.item_name, p.license as held_under, p.location,
    coalesce(nullif(p.raw->>'ReceivedFromFacilityName',''),'(supplier not recorded)') as supplier,
    p.raw->>'ItemFromFacilityLicenseNumber' as origin_license,
    p.raw->>'ReceivedFromManifestNumber' as inbound_manifest,
    (p.raw->>'ReceivedDateTime')::date as received_on,
    (p.raw->>'ReceivedQuantity')::numeric as qty_received,
    p.quantity as qty_remaining,
    p.uom,
    p.raw#>>'{Item,ProductCategoryName}' as category,
    p.raw#>>'{Item,StrainName}' as strain,
    p.raw->>'LabTestingState' as lab_state,
    (p.raw->>'LabTestingRecordedDate')::date as tested_on,
    (p.raw->>'IsFinished')::boolean as finished,
    (p.raw->>'FinishedDate')::date as finished_on
  from metrc_packages p
  where coalesce(p.raw->>'ItemFromFacilityLicenseNumber','') not in ('MC281714','MP281909')
    and coalesce(p.raw->>'ItemFromFacilityLicenseNumber','') <> ''
),
made as (
  select
    i.tag as parent_tag,
    count(*) as children,
    min(c.packaged_on) as first_output_on,
    max(c.packaged_on) as last_output_on,
    round(sum(c.quantity)) as output_qty,
    string_agg(distinct c.raw#>>'{Item,ProductCategoryName}', ', ') as became,
    count(*) filter (where c.raw->>'LabTestingState'='TestPassed') as output_passed,
    count(*) filter (where c.raw->>'LabTestingState'='TestFailed') as output_failed
  from inbound i
  join metrc_packages c on c.raw->>'SourcePackageLabels' like '%'||i.tag||'%'
  group by 1
),
sold as (
  select
    i.tag as parent_tag,
    min(t.created_on::date) as first_shipped_on,
    count(distinct t.manifest_number) as outbound_manifests,
    string_agg(distinct t.recipient, ', ') as sold_to
  from inbound i
  join metrc_packages c on c.raw->>'SourcePackageLabels' like '%'||i.tag||'%'
  join v_metrc_transfer_ledger t
    on t.direction = 'outgoing' and t.created_on::date >= c.packaged_on
  group by 1
)
select
  i.supplier, i.origin_license, i.inbound_manifest, i.received_on,
  i.tag, i.item_name, i.strain, i.category, i.held_under, i.location,
  i.qty_received, i.qty_remaining, i.uom,
  round(coalesce(i.qty_received,0) - coalesce(i.qty_remaining,0)) as qty_consumed,
  i.lab_state, i.tested_on,
  (i.tested_on - i.received_on) as days_receipt_to_test,
  m.children as products_made, m.became, m.output_qty,
  m.output_passed, m.output_failed,
  m.first_output_on,
  (m.first_output_on - i.received_on) as days_receipt_to_first_output,
  case when coalesce(i.qty_received,0) > 0
       then round(100.0*coalesce(m.output_qty,0)/i.qty_received,1) end as recovery_pct,
  s.first_shipped_on, s.outbound_manifests, s.sold_to,
  (s.first_shipped_on - i.received_on) as days_receipt_to_first_sale,
  (current_date - i.received_on) as days_since_received,
  case
    when i.qty_remaining = 0 and s.first_shipped_on is not null
      then 'COMPLETE - received, processed and sold in '||(s.first_shipped_on - i.received_on)||' days'
    when i.qty_remaining = 0 and m.children is not null then 'PROCESSED - made into product, not yet traced to a sale'
    when i.qty_remaining = 0 then 'DRAWN TO ZERO - no output package traced. Investigate.'
    when m.children is not null then 'IN PROCESS - part drawn, '||round(i.qty_remaining)||' '||i.uom||' left'
    when (current_date - i.received_on) > 90
      then 'SITTING '||(current_date - i.received_on)||' DAYS UNTOUCHED - purchased cash doing nothing'
    else 'RECEIVED - not yet drawn'
  end as position
from inbound i
left join made m on m.parent_tag = i.tag
left join sold s on s.parent_tag = i.tag
order by i.received_on desc nulls last;

drop view if exists v_third_party_cycle_time cascade;
create view v_third_party_cycle_time as
select
  supplier,
  count(*) as packages,
  round(sum(qty_received)) as qty_in,
  round(sum(qty_remaining)) as qty_still_here,
  round(avg(days_receipt_to_test),1) as avg_days_to_test,
  round(avg(days_receipt_to_first_output),1) as avg_days_to_first_output,
  round(avg(days_receipt_to_first_sale),1) as avg_days_receipt_to_sale,
  max(days_since_received) as oldest_untouched_days,
  count(*) filter (where position like 'SITTING%') as sitting_untouched,
  count(*) filter (where position like 'COMPLETE%') as completed,
  round(avg(recovery_pct),1) as avg_recovery_pct
from v_third_party_lifecycle
group by 1 order by 3 desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Third Party — Receipt to Sale Clock', 27, 'activity', 'third_party_lifecycle', 'v_third_party_lifecycle',
  'Every purchased package from the inbound manifest that brought it in, through testing and processing, to the outbound manifest that sold it. Days at every stage, what it became, recovery percentage, and whether it is still sitting.'),
 ('Third Party — Cycle Time by Supplier', 28, 'clock', 'third_party_cycle_time', 'v_third_party_cycle_time',
  'By supplier: how long material takes from arriving to being tested, processed and sold, average recovery, and how much is still sitting untouched.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from (values ('third_party_lifecycle'),('third_party_cycle_time')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;

insert into golive_items (phase, phase_name, title, detail, status, owner_action, priority, source, sort)
select * from (values
 (3,'Inventory Control','ANSWER THE OPEN QUESTIONS - Vinny, tomorrow morning',
  'Twenty questions are live on the Open Questions page, raised automatically, ranked by pounds at stake. The big ones: what do we buy from Holyoke Wilds (374.7 lb), who is licence MC283571 with no supplier name (200.8 lb), what do we buy from Jushi (153.6 lb), LC Square (77.5 lb), Gibbys Garden (23.4 lb) and Greater Goods - sound material, failed material bought at a discount to remediate, or biomass for extraction. Plus: do we hold a third licence, because material shows Twisted Growers LLC as an outside supplier. Plus the four storage ceilings and the fresh frozen wet-to-dry ratio. Answering each one closes it automatically. OWNER ACTION: Vinny is getting the answers and will set them.',
  'open',true,'P1','Owner request 2026-08-05 - answers due 2026-08-06',930)
) v(phase,phase_name,title,detail,status,owner_action,priority,source,sort)
where not exists (select 1 from golive_items g where g.title = v.title);;
