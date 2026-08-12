drop view if exists v_stock_on_hand cascade;
create view v_stock_on_hand as
with p as (
  select
    p.license,
    p.raw#>>'{Item,StrainName}' as strain,
    p.raw->>'LabTestingState' as lab_state,
    coalesce(p.location,'(not recorded)') as location,
    p.quantity, p.packaged_on, p.tag,
    p.raw->>'ItemFromFacilityLicenseNumber' as origin_license,
    p.raw->>'ReceivedFromFacilityName' as received_from,
    p.raw->>'ReceivedFromManifestNumber' as manifest,
    case
      when coalesce(p.raw->>'ItemFromFacilityLicenseNumber','') in ('MC281714','MP281909')
        then 'Grown by us'
      when coalesce(p.raw->>'ItemFromFacilityLicenseNumber','') = '' then 'Origin not recorded'
      else 'Bought in'
    end as origin,
    case
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%fresh frozen%' then 'Fresh frozen'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%bud%'          then 'Dried flower'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%shake%'
        or p.raw#>>'{Item,ProductCategoryName}' ilike '%trim%'         then 'Shake and trim'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%concentrate%'  then 'Concentrate'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%roll%'         then 'Pre-rolls'
      when p.raw#>>'{Item,ProductCategoryName}' ilike '%vape%'         then 'Vape'
      else coalesce(p.raw#>>'{Item,ProductCategoryName}','(uncategorised)')
    end as stream
  from metrc_packages p
  where coalesce(p.quantity,0) > 0
    and coalesce((p.raw->>'IsFinished')::boolean,false) = false
)
select
  origin, stream, license, lab_state, location,
  coalesce(nullif(received_from,''), case when origin='Grown by us' then 'Twisted Growers' else '(supplier not recorded)' end) as supplier,
  origin_license,
  count(*) as packages,
  round(sum(quantity)) as grams,
  round(sum(quantity)/453.592, 1) as pounds,
  max(current_date - packaged_on) as oldest_days,
  min(packaged_on) as oldest_packaged,
  count(distinct strain) as strains
from p group by 1,2,3,4,5,6,7 order by sum(quantity) desc;

drop view if exists v_stock_summary cascade;
create view v_stock_summary as
select origin, stream,
  sum(packages) packages,
  round(sum(pounds),1) total_lb,
  round(coalesce(sum(pounds) filter (where lab_state='TestPassed'),0),1) sellable_lb,
  round(coalesce(sum(pounds) filter (where lab_state='TestFailed'),0),1) failed_lb,
  round(coalesce(sum(pounds) filter (where lab_state like '%ubmitted%' and lab_state <> 'NotSubmitted'),0),1) out_for_testing_lb,
  round(coalesce(sum(pounds) filter (where lab_state='NotSubmitted'),0),1) untested_lb,
  max(oldest_days) oldest_days,
  string_agg(distinct supplier, ', ') suppliers
from v_stock_on_hand group by 1,2 order by 1, 4 desc;

drop view if exists v_third_party_stock cascade;
create view v_third_party_stock as
select supplier, origin_license, stream, license as held_under, lab_state, location,
  packages, pounds, oldest_days, oldest_packaged, strains,
  'Bought in from another licence. Must be tracked, allocated and costed separately from what we grow.' as why_separate
from v_stock_on_hand
where origin <> 'Grown by us'
order by pounds desc;

drop view if exists v_own_vs_bought cascade;
create view v_own_vs_bought as
select
  stream,
  round(coalesce(sum(pounds) filter (where origin='Grown by us'),0),1) grown_lb,
  round(coalesce(sum(pounds) filter (where origin='Bought in'),0),1) bought_lb,
  round(coalesce(sum(pounds) filter (where origin='Origin not recorded'),0),1) unknown_origin_lb,
  round(sum(pounds),1) total_lb,
  round(100*coalesce(sum(pounds) filter (where origin='Bought in'),0)/nullif(sum(pounds),0),1) pct_bought_in
from v_stock_on_hand group by 1 order by 5 desc;

drop view if exists v_unrequested_material cascade;
create view v_unrequested_material as
select s.origin, s.supplier, s.stream, s.license, s.location, s.lab_state,
  s.packages, s.pounds, s.oldest_days,
  'No approved allocation covers this material. Under the owner rule nothing may move until Vincent approves it - and that applies to bought-in material as much as our own.' as why_it_matters
from v_stock_on_hand s
where not exists (
  select 1 from allocation_requests r
  where r.status = 'approved'
    and (coalesce(r.stream,'') = s.stream or coalesce(r.material_name,'') ilike '%'||s.stream||'%')
)
order by s.pounds desc;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Grown vs Bought In', 6, 'git-branch', 'own_vs_bought', 'v_own_vs_bought',
  'Every stream split by where it came from: grown by us, bought in from another licence, or origin not recorded. Nothing we grew is ever blended with anything we purchased.'),
 ('Third Party Stock', 7, 'truck', 'third_party_stock', 'v_third_party_stock',
  'Every pound bought in from another licence, by supplier, with what it is, where it is held, its testing state and how long it has been sitting.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from (values ('own_vs_bought'),('third_party_stock')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;;
