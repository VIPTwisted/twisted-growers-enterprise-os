-- ---------------------------------------------------------------------------
-- 0077 — Packaging on hand, reorder levels, and demand driven by real activity.
--
-- Owner 11 Aug 2026: "WE NEED TO TRACK PACKAGING FOR REORDERING PURPOSES TO SEE WHAT
-- WE HAVE ON HAND AND SET LEVELS TO REORDER ALL PACKAGING ALLOW USERS TO SETUP ITEMS
-- THEY NEED TO TRACK BASED ON WHAT IS BEING GROWN, MANUFACTURED, OR IF INVENTORY
-- UNITS SOLD."
--
-- supply_items ALREADY EXISTS - the owner's own packaging catalogue from 5 Aug 2026,
-- with on_hand, reorder_level, vendor and location (all still uncounted). It is
-- EXTENDED here, not duplicated: a second packaging table would guarantee two
-- disagreeing counts.
-- ---------------------------------------------------------------------------
alter table supply_items add column if not exists sku             text;
alter table supply_items add column if not exists reorder_qty     numeric;
alter table supply_items add column if not exists safety_stock    numeric;
alter table supply_items add column if not exists lead_time_days  integer;
alter table supply_items add column if not exists cost_per_unit   numeric;
alter table supply_items add column if not exists track_enabled   boolean not null default false;
alter table supply_items add column if not exists last_counted_at timestamptz;

comment on column supply_items.track_enabled is
  'Users pick which items to track. OFF by default - the catalogue lists everything we '
  'have ever bought, and reordering only makes sense for what someone is actually watching.';
comment on column supply_items.reorder_level is
  'Reorder point. Below this the item is due to be ordered. Admin-set; never derived.';

-- What consumes each item, and how much per unit of that activity.
create table if not exists supply_consumption_rule (
  id              bigserial primary key,
  supply_item_id  uuid not null references supply_items(id) on delete cascade,
  driver          text not null check (driver in
                    ('units_sold','units_manufactured','plants_grown','lb_packaged','lb_harvested')),
  scope           text not null default 'global'
                    check (scope in ('brand','product_line','category','global')),
  scope_key       text,
  qty_per_driver  numeric not null,
  effective_from  date not null default current_date,
  effective_to    date,
  set_by          text not null,
  note            text,
  updated_at      timestamptz not null default now(),
  constraint consumption_scope_key_required check (scope = 'global' or scope_key is not null),
  constraint consumption_no_overlap exclude using gist (
    supply_item_id with =, driver with =, scope with =, coalesce(scope_key,'') with =,
    daterange(effective_from, coalesce(effective_to,'infinity'::date), '[)') with &&)
);

comment on table supply_consumption_rule is
  'How much of a packaging item each unit of activity consumes. driver says WHICH '
  'activity: units sold, units manufactured, plants grown, pounds packaged or pounds '
  'harvested. One cone per pre-roll sold, one jar per 3.5 g pack, and so on. Demand is '
  'then measured from real activity rather than guessed.';

-- Demand measured from actual activity, by driver.
create or replace view v_supply_demand as
with sold as (   -- units sold, by category and brand, last 90 days and last 365
  select apex_category as category, brand,
         sum(units) filter (where order_date >= current_date - 90)  as units_90d,
         sum(units) filter (where order_date >= current_date - 365) as units_365d
  from v_material_requirement group by 1,2),
grown as (
  select count(*)::numeric as plants_now from metrc_plants)
select si.id as supply_item_id, si.name as supply_item, si.category as supply_category,
       si.unit, si.on_hand, si.reorder_level, si.reorder_qty, si.safety_stock,
       si.lead_time_days, si.vendor, si.track_enabled,
       r.driver, r.scope, r.scope_key, r.qty_per_driver,
       case r.driver
         when 'units_sold' then coalesce((
              select sum(s.units_90d) from sold s
              where (r.scope='global')
                 or (r.scope='category' and s.category = r.scope_key)
                 or (r.scope='brand'    and s.brand    = r.scope_key)),0)
         when 'plants_grown' then (select plants_now from grown)
         else null end                                              as driver_qty_90d,
       round((case r.driver
         when 'units_sold' then coalesce((
              select sum(s.units_90d) from sold s
              where (r.scope='global')
                 or (r.scope='category' and s.category = r.scope_key)
                 or (r.scope='brand'    and s.brand    = r.scope_key)),0)
         when 'plants_grown' then (select plants_now from grown)
         else 0 end * r.qty_per_driver)::numeric,0)                 as required_90d
from supply_items si
left join supply_consumption_rule r on r.supply_item_id = si.id
  and current_date >= r.effective_from and (r.effective_to is null or current_date < r.effective_to);

comment on view v_supply_demand is
  'Packaging demand measured from real activity over the last 90 days, using the '
  'consumption rules. An item with no rule shows a NULL driver - that is a gap to fill, '
  'not a zero.';

create or replace view v_supply_reorder as
select supply_item_id, supply_item, supply_category, unit, vendor, lead_time_days,
       on_hand, reorder_level, reorder_qty, safety_stock, track_enabled,
       driver, required_90d,
       case
         when not track_enabled                       then 'NOT TRACKED'
         when on_hand is null                         then 'NEVER COUNTED'
         when reorder_level is null                   then 'NO REORDER LEVEL SET'
         when on_hand <= coalesce(safety_stock,0)     then 'CRITICAL — at or below safety stock'
         when on_hand <= reorder_level                then 'REORDER NOW'
         when required_90d is not null and required_90d > 0
              and on_hand < required_90d              then 'SHORT OF 90-DAY DEMAND'
         else 'OK' end                                as status,
       case when on_hand is not null and reorder_level is not null and on_hand <= reorder_level
            then greatest(coalesce(reorder_qty, reorder_level - on_hand), 0) end as suggested_order_qty
from v_supply_demand;

comment on view v_supply_reorder is
  'What to reorder and why. NEVER COUNTED and NO REORDER LEVEL SET are reported as '
  'their own states rather than being treated as zero - an uncounted item is not an '
  'item we have none of, and the difference matters when someone is placing an order.';

alter table supply_consumption_rule enable row level security;
drop policy if exists supply_consumption_rule_manage on supply_consumption_rule;
create policy supply_consumption_rule_manage on supply_consumption_rule for all
  using (f_can_manage_inventory()) with check (f_can_manage_inventory());
grant select, insert, update, delete on supply_consumption_rule to authenticated;
grant select on v_supply_demand, v_supply_reorder to authenticated;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order, admin_only)
values
 ('Reports','Packaging Reorder','supply_reorder','v_supply_reorder','reports','report',
  'issue_queue','Inventory & Audit','reports','box',
  'What to reorder and why: on hand against the reorder level and against real 90-day '
  'demand. Never-counted and no-level-set are shown as their own states, never as zero.',
  'not_applicable','this_year','activity',true,14,false),
 ('Reports','Packaging Catalogue & Levels','supply_items','supply_items','reports','report',
  'rules_editor','Inventory & Audit','reports','box',
  'Every packaging item, its count on hand, reorder level, safety stock, vendor and lead '
  'time. Turn tracking on for the items you actually want watched.',
  'not_applicable','this_year','activity',true,15,false),
 ('Reports','Packaging Consumption Rules','supply_consumption_rule','supply_consumption_rule',
  'reports','report','rules_editor','Inventory & Audit','reports','box',
  'How much packaging each unit of activity consumes — per unit sold, per unit '
  'manufactured, per plant grown, per pound packaged or harvested. This is what turns '
  'real activity into real demand.',
  'auto','this_year','activity',true,16,true)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, description=excluded.description,
  admin_only=excluded.admin_only, enabled=true;
;
