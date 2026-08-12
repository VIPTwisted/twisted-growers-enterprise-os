-- ---------------------------------------------------------------------------
-- 0078 — Restock cadence. Some items are bought monthly, some per harvest.
--
-- Owner 11 Aug 2026: "RESTOCK LEVELS NEEDED OR SOME ARE BOUGHT MONTHLY OTHERS PER
-- HARVEST MAKE THIS VERY FLEXIBLE."
--
-- Cadence is kept as a KIND plus an INTERVAL rather than a fixed list, so "every 2
-- months" and "every 3rd harvest" need no schema change. Event-driven cadences
-- (per harvest, per pull, per batch) are due when the EVENT happens, not on a date -
-- which is the whole point of separating them from calendar cadences.
-- ---------------------------------------------------------------------------
alter table supply_items add column if not exists cadence_kind text not null default 'on_demand';
alter table supply_items add column if not exists cadence_every integer not null default 1;
alter table supply_items add column if not exists cadence_anchor date;
alter table supply_items add column if not exists cover_days integer;
alter table supply_items add column if not exists last_ordered_at date;

alter table supply_items drop constraint if exists supply_items_cadence_kind_check;
alter table supply_items add constraint supply_items_cadence_kind_check check (cadence_kind in
  ('on_demand','daily','weekly','monthly','quarterly','annually','per_harvest','per_pull','per_batch'));

comment on column supply_items.cadence_kind is
  'How this item is restocked. Calendar cadences (weekly/monthly/quarterly/annually) '
  'fall due on a date; event cadences (per_harvest/per_pull/per_batch) fall due when '
  'the event happens. on_demand means it is driven purely by the reorder level.';
comment on column supply_items.cadence_every is
  'Multiplier on the cadence: 2 with monthly means every two months, 3 with per_harvest '
  'means every third harvest. Avoids needing a new cadence kind for every variation.';
comment on column supply_items.cover_days is
  'How many days of demand an order should cover. Used to size the order when no fixed '
  'reorder_qty is set.';

create or replace view v_supply_restock_due as
with harv as (
  select max(finished_on) as last_harvest,
         (select max(harvest_start)::date from metrc_harvests) as last_started
  from metrc_rpt_harvest_moisture),
pull_days as (
  select coalesce((select value::int from conversion_factors where key='pull_interval_days'),14) d)
select si.id as supply_item_id, si.name as supply_item, si.category as supply_category,
       si.unit, si.vendor, si.lead_time_days, si.track_enabled,
       si.on_hand, si.reorder_level, si.reorder_qty, si.safety_stock, si.cover_days,
       si.cadence_kind, si.cadence_every, si.cadence_anchor, si.last_ordered_at,
       case si.cadence_kind
         when 'daily'     then coalesce(si.last_ordered_at, si.cadence_anchor) + (si.cadence_every)
         when 'weekly'    then coalesce(si.last_ordered_at, si.cadence_anchor) + (7  * si.cadence_every)
         when 'monthly'   then (coalesce(si.last_ordered_at, si.cadence_anchor) + (si.cadence_every || ' month')::interval)::date
         when 'quarterly' then (coalesce(si.last_ordered_at, si.cadence_anchor) + (3 * si.cadence_every || ' month')::interval)::date
         when 'annually'  then (coalesce(si.last_ordered_at, si.cadence_anchor) + (si.cadence_every || ' year')::interval)::date
         when 'per_harvest' then (select last_harvest from harv) + ((select d from pull_days) * si.cadence_every)
         when 'per_pull'    then (select last_harvest from harv) + ((select d from pull_days) * si.cadence_every)
         else null end                                            as next_due,
       case
         when not si.track_enabled                                then 'NOT TRACKED'
         when si.on_hand is null                                  then 'NEVER COUNTED'
         when si.on_hand <= coalesce(si.safety_stock,0)
              and si.safety_stock is not null                     then 'CRITICAL — at or below safety stock'
         when si.reorder_level is not null and si.on_hand <= si.reorder_level
                                                                  then 'REORDER NOW — below level'
         when si.cadence_kind in ('per_harvest','per_pull')
              and (select last_harvest from harv) is not null
              and coalesce(si.last_ordered_at, date '1900-01-01') < (select last_harvest from harv)
                                                                  then 'DUE — a harvest has come off since the last order'
         when si.cadence_kind not in ('on_demand','per_harvest','per_pull','per_batch')
              and coalesce(si.last_ordered_at, si.cadence_anchor) is null
                                                                  then 'NO ANCHOR DATE SET'
         else 'OK' end                                            as status
from supply_items si;

comment on view v_supply_restock_due is
  'When each packaging item is next due, whether by calendar or by harvest. An item '
  'bought per harvest becomes due as soon as a harvest comes off; a monthly item falls '
  'due on its own cycle. NEVER COUNTED and NO ANCHOR DATE SET are reported as their own '
  'states, never silently as OK.';

grant select on v_supply_restock_due to authenticated;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order, admin_only)
values ('Reports','Packaging Restock Due','supply_restock_due','v_supply_restock_due',
  'reports','report','issue_queue','Inventory & Audit','reports','box',
  'When each packaging item is next due — monthly, quarterly, annually, or per harvest. '
  'Event cadences fall due when the harvest actually comes off, not on a date.',
  'not_applicable','this_year','activity',true,17,false)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, description=excluded.description, enabled=true;
;
