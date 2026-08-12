-- Agent I (Database COO), 12 Aug 2026. DBI-046 v2 (reviewers V, X, W). Owner: GO.
-- v2: supply_consumption_rule already constrains driver to
-- units_sold | units_manufactured | plants_grown | lb_packaged | lb_harvested. I invented
-- 'each' and 'package'. Using the vocabulary the schema already has - the same rule I enforce
-- on everyone else about not inventing a second dialect.
--
-- CORRECTION TO MY OWN CENSUS, on the record: I reported supply_items as "15 items with reorder
-- levels, the cheapest win". WRONG. All 15 rows carry NULL on_hand, NULL reorder_level, NULL
-- cost_per_unit, track_enabled = false. It is a list of NAMES. I read the row count and not the
-- rows - precisely the failure this platform keeps catching in others.
--
-- WHAT IS BUILDABLE TODAY AND IS WORTH REAL MONEY: consumption is fully derivable from Metrc
-- production. 176 Raw Pre-Roll packages, 66 Vape, 73 Infused, 257 Bud packages in the last 30
-- days. With a rate per item the platform states what was USED without anyone counting a shelf.
-- Consumption is MEASURED; on hand needs a physical count only a person can give; the view is
-- explicit about which half is missing rather than showing a false zero (A1/A3).
--
-- UNIT DRIVERS NEVER USE WEIGHT. A pre-roll consumes one tube whatever it weighs, and Metrc
-- reports Raw Pre-Rolls in kg - driving off weight would order tubes by the kilogram.
-- units_manufactured therefore counts EACHES where the category reports in ea, otherwise the
-- PACKAGE COUNT.
--
-- EVERY SEEDED RATE IS PROVISIONAL AND FLAGGED. "One tube per pre-roll" is near-certain; "one
-- outer box per 100" is a guess at his packing convention. A guessed rate that silently drives
-- a purchase order is the fabrication this platform forbids.
--
-- UNDO: drop view v_supply_position; drop view v_supply_consumption;
--       delete from supply_consumption_rule where set_by = 'Agent I (provisional)';

create or replace view public.v_supply_consumption as
with produced as (
  select p.raw#>>'{Item,ProductCategoryName}'  as category,
         (p.raw->>'PackagedDate')::date        as packaged_on,
         count(*)                              as packages,
         sum(case when lower(coalesce(p.uom,'')) in ('ea','each')
                  then coalesce((p.raw->>'Quantity')::numeric,0) else 0 end) as eaches,
         sum(f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0), p.uom))  as lb
  from metrc_packages p
  where coalesce(p.raw->>'PackagedDate','') <> ''
    and (p.raw->>'PackagedDate')::date >= current_date - 180
  group by 1,2
),
driven as (
  select pr.category, pr.packaged_on,
         case when pr.eaches > 0 then pr.eaches else pr.packages end as units_manufactured,
         pr.lb                                                       as lb_packaged
  from produced pr
)
select r.id                                    as rule_id,
       s.id                                    as supply_item_id,
       s.name                                  as supply_item,
       s.category                              as supply_category,
       s.unit,
       r.driver,
       r.scope_key                             as applies_to_category,
       r.qty_per_driver,
       (r.set_by = 'Agent I (provisional)')    as rate_is_provisional,
       sum(case r.driver when 'units_manufactured' then d.units_manufactured
                         when 'lb_packaged'        then d.lb_packaged else 0 end)
         filter (where d.packaged_on >= current_date - 30)                     as drivers_30d,
       round(sum(case r.driver when 'units_manufactured' then d.units_manufactured
                               when 'lb_packaged'        then d.lb_packaged else 0 end)
             filter (where d.packaged_on >= current_date - 30) * r.qty_per_driver, 0) as consumed_30d,
       round(sum(case r.driver when 'units_manufactured' then d.units_manufactured
                               when 'lb_packaged'        then d.lb_packaged else 0 end)
             filter (where d.packaged_on >= current_date - 90) * r.qty_per_driver / 3.0, 0) as avg_monthly_90d
from supply_consumption_rule r
join supply_items s on s.id = r.supply_item_id
left join driven d on d.category = r.scope_key
where coalesce(r.effective_to, current_date) >= current_date
group by r.id, s.id, s.name, s.category, s.unit, r.driver, r.scope_key, r.qty_per_driver, r.set_by;

comment on view public.v_supply_consumption is
 'What production actually consumed, derived from Metrc packaging activity - measured, not '
 'estimated. units_manufactured counts EACHES where the category reports in ea, otherwise the '
 'PACKAGE COUNT: a pre-roll consumes one tube whatever it weighs, and Raw Pre-Rolls are reported '
 'in kg, so a weight driver would order tubes by the kilogram. rate_is_provisional = true means '
 'Agent I seeded the rate and the owner has not confirmed it - a guessed rate must never '
 'silently drive a purchase order.';

create or replace view public.v_supply_position as
select s.name as supply_item, s.category, s.unit,
       s.on_hand, s.reorder_level, s.safety_stock, s.lead_time_days, s.cost_per_unit,
       c.consumed_30d, c.avg_monthly_90d, c.rate_is_provisional,
       case when c.avg_monthly_90d > 0 and s.on_hand is not null
            then round(s.on_hand / (c.avg_monthly_90d / 30.0), 1) end as days_of_cover,
       case when s.on_hand is not null and c.avg_monthly_90d > 0 and s.lead_time_days is not null
            then round(c.avg_monthly_90d / 30.0 * s.lead_time_days, 0) end as needed_during_lead_time,
       round(coalesce(c.consumed_30d,0) * coalesce(s.cost_per_unit,0), 2) as spend_30d,
       case
         when s.on_hand is null then
           'ON HAND NOT COUNTED — consumption is measured from production, but nobody has counted this shelf. Enter a count to unlock days of cover and reorder alerting.'
         when c.avg_monthly_90d is null or c.avg_monthly_90d = 0 then
           'NO CONSUMPTION RULE — the platform does not know what draws this item down, so it cannot say when to reorder.'
         when s.reorder_level is not null and s.on_hand <= s.reorder_level then
           'REORDER NOW — at or below the reorder level'
         when s.lead_time_days is not null and c.avg_monthly_90d > 0
              and s.on_hand < (c.avg_monthly_90d / 30.0 * s.lead_time_days) then
           'REORDER NOW — less stock than the lead time will consume'
         else 'OK'
       end as status
from supply_items s
left join v_supply_consumption c on c.supply_item_id = s.id;

comment on view public.v_supply_position is
 'Packaging supply: boxes, labels, tubes, jars, cartridges, ink. Consumption is MEASURED from '
 'Metrc production; ON HAND needs a physical count only a person can give, and status says '
 'exactly which half is missing rather than showing a false zero. Once a count exists, cover and '
 'lead-time reordering compute themselves. "Less stock than the lead time will consume" is the '
 'alert that actually prevents a stockout - a reorder level alone fires too late when a vendor '
 'takes three weeks.';

insert into supply_consumption_rule (supply_item_id, driver, scope, scope_key, qty_per_driver, effective_from, set_by, note)
select s.id, v.driver, 'category', v.cat, v.qty, current_date, 'Agent I (provisional)',
       'PROVISIONAL, seeded 12 Aug 2026 from the physical relationship. ' || v.why ||
       ' Owner confirms or corrects; until then v_supply_position flags it provisional.'
from (values
  ('Pre-roll tubes — glass',        'units_manufactured','Raw Pre-Rolls',      1.0,  'One tube holds one pre-roll.'),
  ('Pre-roll tubes — plastic',      'units_manufactured','Raw Pre-Rolls',      1.0,  'One tube per pre-roll; split against glass once the owner states the mix.'),
  ('Pre-roll labels — by brand',    'units_manufactured','Raw Pre-Rolls',      1.0,  'One label per tube.'),
  ('Pre-roll cones — size variants','units_manufactured','Raw Pre-Rolls',      1.0,  'One cone becomes one pre-roll.'),
  ('Vape cartridges',               'units_manufactured','Vape Product',       1.0,  'One cartridge per vape unit.'),
  ('Vape plastic tubes',            'units_manufactured','Vape Product',       1.0,  'One tube per cartridge.'),
  ('Vape outer boxes',              'units_manufactured','Vape Product',       1.0,  'One retail box per vape unit.'),
  ('3.5g flower jars',              'units_manufactured','Buds',               1.0,  'GUESS: one jar per packaged bud unit - the real ratio depends on how he breaks bulk into 3.5g jars.'),
  ('3.5g outer boxes',              'units_manufactured','Buds',               1.0,  'GUESS: pairs with the jar.'),
  ('Concentrate jars',              'units_manufactured','Concentrate',        1.0,  'One jar per concentrate package.'),
  ('Concentrate labels',            'units_manufactured','Concentrate',        1.0,  'One label per jar.'),
  ('Concentrate boxes',             'units_manufactured','Concentrate',        1.0,  'One box per jar.'),
  ('Concentrate stickers',          'units_manufactured','Concentrate',        1.0,  'One sticker per jar.'),
  ('Concentrate outer boxes',       'units_manufactured','Concentrate (Bulk)', 1.0,  'GUESS: bulk shipper.'),
  ('100ct outer boxes',             'units_manufactured','Raw Pre-Rolls',      0.01, 'GUESS: one outer box per 100 pre-rolls.')
) as v(item, driver, cat, qty, why)
join supply_items s on s.name = v.item
where not exists (select 1 from supply_consumption_rule r where r.supply_item_id = s.id);;
