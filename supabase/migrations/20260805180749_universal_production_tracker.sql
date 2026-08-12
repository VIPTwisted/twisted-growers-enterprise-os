-- Third-party purchases the state record does not describe as production input.
create table if not exists third_party_purchases (
  id uuid primary key default gen_random_uuid(),
  received_on date not null default current_date,
  vendor text not null,
  material_class text not null check (material_class in ('trim','flower','concentrate','seed','clone','other')),
  description text not null,
  strain text,
  quantity numeric not null check (quantity > 0),
  uom text not null default 'g',
  unit_cost numeric,
  total_cost numeric,
  metrc_tag text,
  manifest_number text,
  coa_link text,
  location text,
  intended_use text,
  status text not null default 'received'
    check (status in ('received','quarantine','released','allocated','in_production','finished','rejected')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
alter table third_party_purchases enable row level security;
drop policy if exists tpp_read on third_party_purchases;
drop policy if exists tpp_write on third_party_purchases;
create policy tpp_read on third_party_purchases for select to authenticated using (true);
create policy tpp_write on third_party_purchases for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));

-- THE PRODUCTION TRACKER: every material class, grown or bought, seed to sale,
-- with its allocation approval state. Separate from planning.
create or replace view v_production_tracker as
-- Seeds and clones
select
  'Seed / Clone' as material_class, 'Grown' as origin,
  pb.name as item, pb.strain, pb.name as identifier,
  coalesce(pb.count,0)::numeric as quantity, 'plants' as uom,
  'Propagation' as location, pb.planted_on as started_on,
  (current_date - pb.planted_on)::numeric as days_in_system,
  'Propagation' as stage, pb.license,
  null::text as vendor, null::numeric as cost,
  (select a.status from allocation_requests a where a.source_ref ilike '%'||pb.name||'%' order by a.created_at desc limit 1) as allocation_status,
  (select a.decider_name from allocation_requests a where a.source_ref ilike '%'||pb.name||'%' and a.status='approved' order by a.decided_at desc limit 1) as approved_by,
  null::text as coa_link
from metrc_plant_batches pb where pb.source_state = 'active'
union all
-- Living plants by room
select 'Plant', 'Grown', pl.room || ' — ' || coalesce(pl.strain,'plants'), pl.strain, pl.room,
  count(*)::numeric, 'plants', pl.room, min(pl.planted_on),
  max(current_date - pl.planted_on)::numeric, initcap(pl.source_state), pl.license,
  null, null, null, null, null
from metrc_plants pl where pl.source_state in ('vegetative','flowering','onhold')
group by pl.room, pl.strain, pl.license, pl.source_state
union all
-- Harvest lots: trim and bulk flower in process
select
  case when m.harvest ilike '%FF%' or m.stage ilike '%froz%' then 'Fresh frozen' else 'Bulk flower / trim' end,
  'Grown', m.harvest, m.strains, m.harvest,
  round(coalesce(m.current_weight, m.wet_weight, 0)::numeric,1), coalesce(m.uom,'g'),
  coalesce(m.room,'(no room)'), m.harvest_start, m.days_since_takedown::numeric,
  m.stage, m.license, null, null,
  (select a.status from allocation_requests a where a.source_ref ilike '%'||m.harvest||'%' order by a.created_at desc limit 1),
  (select a.decider_name from allocation_requests a where a.source_ref ilike '%'||m.harvest||'%' and a.status='approved' order by a.decided_at desc limit 1),
  null
from v_harvest_stage_map m where m.stage not in ('Finished','Archived')
union all
-- Packaged product by class
select
  case
    when coalesce(p.raw->>'ProductCategoryName','') ilike '%concentrate%' or coalesce(p.item_name,'') ~* '(rosin|hash|distillate|crude|diamond|isolate|badder|sauce)' then 'Concentrate'
    when coalesce(p.raw->>'ProductCategoryName','') ilike '%vape%' or coalesce(p.item_name,'') ~* '(vape|cart)' then 'Vape'
    when coalesce(p.raw->>'ProductCategoryName','') ~* 'pre.?roll' or coalesce(p.item_name,'') ~* 'pre.?roll' then 'Pre-roll'
    when coalesce(p.raw->>'ProductCategoryName','') ilike '%flower%' or coalesce(p.item_name,'') ilike '%flower%' then 'Packaged flower'
    when coalesce(p.item_name,'') ilike '%trim%' then 'Trim'
    else 'Other product' end,
  'Grown', coalesce(p.item_name,'(unnamed)'), null, p.tag,
  coalesce(p.quantity,0), coalesce(p.uom,'ea'), coalesce(p.location,'(no location)'),
  p.packaged_on, (current_date - p.packaged_on)::numeric,
  case when (p.raw->>'IsOnHold')::boolean then 'ON HOLD'
       when p.source_state='intransit' then 'Shipped'
       when p.lab_testing_state='TestPassed' then 'Sellable'
       when p.lab_testing_state='TestFailed' then 'FAILED TESTING'
       else coalesce(p.lab_testing_state,'In inventory') end,
  p.license, null, null,
  (select a.status from allocation_requests a where a.source_ref ilike '%'||p.tag||'%' order by a.created_at desc limit 1),
  (select a.decider_name from allocation_requests a where a.source_ref ilike '%'||p.tag||'%' and a.status='approved' order by a.decided_at desc limit 1),
  (select r.coa_link from metrc_lab_results r where r.package_tag = p.tag and r.coa_link is not null limit 1)
from metrc_packages p where p.source_state in ('active','onhold','intransit')
union all
-- Third-party purchased material
select
  initcap(t.material_class) || ' (purchased)', 'Third party', t.description, t.strain, coalesce(t.metrc_tag, t.id::text),
  t.quantity, t.uom, coalesce(t.location,'(no location)'), t.received_on,
  (current_date - t.received_on)::numeric, initcap(t.status), 'purchased',
  t.vendor, coalesce(t.total_cost, t.quantity * coalesce(t.unit_cost,0)),
  (select a.status from allocation_requests a where a.source_ref ilike '%'||coalesce(t.metrc_tag,t.description)||'%' order by a.created_at desc limit 1),
  (select a.decider_name from allocation_requests a where a.source_ref ilike '%'||coalesce(t.metrc_tag,t.description)||'%' and a.status='approved' order by a.decided_at desc limit 1),
  t.coa_link
from third_party_purchases t where t.status <> 'finished';

-- Anything sitting in production without an approved allocation.
create or replace view v_awaiting_allocation as
select material_class, origin, item, strain, identifier, quantity, uom, location, stage,
  days_in_system, vendor, cost,
  coalesce(allocation_status, 'no request') as allocation_status, approved_by,
  case
    when allocation_status = 'approved' then 'Approved by ' || coalesce(approved_by, 'an approver')
    when allocation_status = 'pending' then 'AWAITING APPROVAL'
    when allocation_status = 'denied' then 'DENIED - decide what happens to it'
    else 'NO ALLOCATION REQUESTED - this material has no approved destination' end as approval_state
from v_production_tracker
where coalesce(allocation_status,'') <> 'approved'
order by days_in_system desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select v.cat, (select category_order from nav_registry n2 where n2.category = v.cat limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Inventory','Production Tracker (everything)', 0, 'box', 'production_tracker', 'v_production_tracker', 'Every material in the company seed to sale: seeds and clones, living plants, harvest lots, trim, bulk and fresh frozen flower, concentrates, vapes, pre-rolls, packaged flower, and everything bought from a third party - with where it sits, its stage, how long it has been in the system, its cost where purchased, its Certificate of Analysis, and whether its allocation has been approved and by whom.'),
  ('Inventory','Awaiting Allocation Approval', 7, 'shield', 'awaiting_allocation', 'v_awaiting_allocation', 'Everything in production with no approved allocation: awaiting approval, denied, or never requested - ranked by how long it has been sitting.'),
  ('Inventory','Third-Party Purchases', 8, 'truck', 'third_party_purchases', 'third_party_purchases', 'Trim, flower, concentrate and any other material bought from a third party: vendor, quantity, cost, Certificate of Analysis, manifest, location, intended use and status - each one enters the production tracker and needs an approved allocation like anything grown.')
) v(cat, l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select material_class, origin, count(*) items, round(sum(quantity)::numeric,0) qty
from v_production_tracker group by 1,2 order by items desc;;
