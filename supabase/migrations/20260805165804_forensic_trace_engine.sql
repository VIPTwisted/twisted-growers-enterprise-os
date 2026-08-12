-- Forensic seed-to-sale trace: give it a tag, strain, harvest, item, room, or manifest
-- and it returns the complete chain of custody with every date, weight, and location.
create or replace function tg_trace(p_term text)
returns table(
  event_date date, phase text, event text, subject text, identifier text,
  quantity numeric, uom text, location text, status text, counterparty text, document_link text
) as $$
begin
  return query
  -- Plants
  select pl.planted_on, '1 Plant', 'Plant tagged in ' || coalesce(pl.room,'(no room)'),
    coalesce(pl.strain,'(no strain)'), pl.tag, 1::numeric, 'plant', pl.room,
    case pl.source_state when 'inactive' then 'Harvested or retired' else initcap(pl.source_state) end,
    null::text, null::text
  from metrc_plants pl
  where pl.tag ilike '%'||p_term||'%' or pl.strain ilike '%'||p_term||'%' or pl.room ilike '%'||p_term||'%'
  union all
  -- Plant batches
  select pb.planted_on, '1 Plant', 'Batch started: ' || pb.name, coalesce(pb.strain,'(no strain)'), pb.name,
    coalesce(pb.count,0)::numeric, 'plants', 'Propagation', initcap(coalesce(pb.source_state,'')), null, null
  from metrc_plant_batches pb
  where pb.name ilike '%'||p_term||'%' or pb.strain ilike '%'||p_term||'%'
  union all
  -- Harvest takedown
  select h.harvest_start, '2 Harvest', 'Takedown: ' || h.name,
    coalesce(h.raw->>'SourceStrainNames', h.name), h.name,
    coalesce((h.raw->>'TotalWetWeight')::numeric,0), coalesce(h.raw->>'UnitOfWeightName','g'),
    coalesce(h.raw->>'DryingLocationName','(no room)'),
    coalesce((h.raw->>'PlantCount'),'0') || ' plants harvested', null, null
  from metrc_harvests h
  where h.name ilike '%'||p_term||'%' or coalesce(h.raw->>'SourceStrainNames','') ilike '%'||p_term||'%'
     or coalesce(h.raw->>'DryingLocationName','') ilike '%'||p_term||'%'
  union all
  -- Waste against the harvest
  select h.harvest_start, '3 Loss', 'Waste recorded against ' || h.name,
    coalesce(h.raw->>'SourceStrainNames', h.name), h.name,
    coalesce((h.raw->>'TotalWasteWeight')::numeric,0), coalesce(h.raw->>'UnitOfWeightName','g'),
    coalesce(h.raw->>'DryingLocationName','(no room)'), 'Waste', null, null
  from metrc_harvests h
  where (h.name ilike '%'||p_term||'%' or coalesce(h.raw->>'SourceStrainNames','') ilike '%'||p_term||'%')
    and coalesce((h.raw->>'TotalWasteWeight')::numeric,0) > 0
  union all
  -- Packages created
  select p.packaged_on, '4 Package', 'Package created: ' || coalesce(p.item_name,'(unnamed)'),
    coalesce(nullif(p.raw->>'SourceHarvestNames',''),'(no source harvest)'), p.tag,
    coalesce(p.quantity,0), coalesce(p.uom,'ea'), coalesce(p.location,'(no location)'),
    case when (p.raw->>'IsOnHold')::boolean then 'ON HOLD'
         when p.source_state='intransit' then 'In transit'
         when p.source_state='inactive' then 'Closed or sold'
         else coalesce(p.lab_testing_state,'In inventory') end,
    null, null
  from metrc_packages p
  where p.tag ilike '%'||p_term||'%' or coalesce(p.item_name,'') ilike '%'||p_term||'%'
     or coalesce(p.raw->>'SourceHarvestNames','') ilike '%'||p_term||'%'
     or coalesce(p.location,'') ilike '%'||p_term||'%'
  union all
  -- Laboratory results
  select r.result_date, '5 Laboratory', 'Test: ' || coalesce(r.test_name, r.test_type, 'result'),
    r.package_tag, r.package_tag, r.result, coalesce(r.units,''), coalesce(r.lab_facility,'(laboratory not recorded)'),
    case when r.passed is true then 'Passed' when r.passed is false then 'FAILED' else 'Recorded' end,
    r.lab_facility, r.coa_link
  from metrc_lab_results r
  where r.package_tag ilike '%'||p_term||'%'
     or exists (select 1 from metrc_packages p2 where p2.tag = r.package_tag
                and (coalesce(p2.item_name,'') ilike '%'||p_term||'%'
                     or coalesce(p2.raw->>'SourceHarvestNames','') ilike '%'||p_term||'%'))
  union all
  -- Manifests that moved it
  select t.created_on, '6 Transfer', 'Manifest ' || t.manifest_number || ' (' || t.direction || ')',
    coalesce(t.recipient, t.shipper, '(counterparty not recorded)'), t.manifest_number,
    coalesce((t.raw->>'PackageCount')::numeric,0), 'packages',
    coalesce(t.shipper,''), initcap(t.direction),
    coalesce(t.recipient, t.shipper),
    case when t.raw->>'Id' is not null then 'https://ma.metrc.com/reports/transfers/'||(t.raw->>'Id')||'/manifest' end
  from metrc_transfers t
  where t.manifest_number ilike '%'||p_term||'%'
     or coalesce(t.recipient,'') ilike '%'||p_term||'%' or coalesce(t.shipper,'') ilike '%'||p_term||'%'
     or exists (select 1 from metrc_packages p3
                where (p3.tag ilike '%'||p_term||'%' or coalesce(p3.raw->>'SourceHarvestNames','') ilike '%'||p_term||'%')
                  and t.raw::text like '%'||p3.tag||'%')
  union all
  -- Allocation decisions
  select a.created_at::date, '7 Allocation', 'Requested by ' || coalesce(a.requester_name,'someone') || ': ' || a.material_name,
    a.material_name, 'Request #' || a.request_no, a.quantity, a.uom, a.destination,
    upper(a.status) || case when a.decider_name is not null then ' by ' || a.decider_name else '' end
      || case when a.decision_reason is not null then ' - ' || a.decision_reason else '' end,
    a.decider_name, null
  from allocation_requests a
  where a.material_name ilike '%'||p_term||'%' or coalesce(a.source_ref,'') ilike '%'||p_term||'%'
     or coalesce(a.strain,'') ilike '%'||p_term||'%'
  order by 1 nulls last, 2;
end $$ language plpgsql stable;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Metrc', (select category_order from nav_registry where category='Metrc' limit 1),
  'Forensic Trace', 2, 'dna', 'forensic_trace', null,
  'One search box for the whole company: type any tag, strain, harvest, item, room, manifest, or customer and get the complete seed to sale chain - plants, takedown, waste, packages, laboratory results, manifests with links, and allocation decisions, in date order.',
  true, false, false
where not exists (select 1 from nav_registry where view_key = 'forensic_trace');
select event_date, phase, event, quantity, uom, location, status from tg_trace('Gush Mintz') limit 8;;
