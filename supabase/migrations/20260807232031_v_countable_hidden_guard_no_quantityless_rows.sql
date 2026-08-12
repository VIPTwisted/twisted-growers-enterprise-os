-- THE GUARD. Owner, 7 Aug 2026: "do not allow that, agents should flag that."
--
-- A view that reports weight only will silently drop every countable item. On
-- 7 Aug 2026 that hid 5,163 ZEN gummies across 34 packages inside an ownership
-- report - they showed as "countable" with no number, which reads as nothing.
--
-- This finds any ACTIVE package whose unit is countable, so an agent can check that
-- whatever it is about to publish still shows a number for these. A rule with no
-- check expires - that is the meta-trap this platform keeps paying for.
--
-- UNDO: drop view v_countable_inventory;

create or replace view public.v_countable_inventory as
select p.tag                          as package_tag,
       left(p.item_name, 55)          as item_name,
       p.license,
       p.uom                          as unit_of_measure,
       p.quantity                     as units,
       trim(to_char(p.quantity, 'FM999G999G990D99')) || ' ' || p.uom as how_much,
       p.source_state,
       p.raw->>'LocationName'         as location,
       p.raw->>'ItemFromFacilityName' as item_defined_by,
       f_is_weight(p.uom)             as is_weight_based,
       'THE ISSUE: this item is counted, not weighed. Any figure built on pounds '
       'alone excludes it entirely and the total will be wrong without saying so.'
                                      as what_is_wrong,
       'Report units and pounds SEPARATELY, or use a how_much column that renders '
       'whichever applies. Never publish a row with no quantity on it, and never '
       'add units to pounds.'         as what_to_do
from (select distinct on (tag) tag, item_name, license, uom, quantity, source_state, raw
      from metrc_packages order by tag, license) p
where not f_is_weight(p.uom)
  and p.source_state = any (array['active','onhold'])
  and coalesce(p.quantity, 0) > 0;

comment on view public.v_countable_inventory is
  'Every active COUNTABLE package - the inventory a pounds-only report silently '
  'drops. Cross-check any tile or total against this: if it is built on pounds and '
  'these rows are not accounted for somewhere, the total is wrong. Countable items '
  'have no weight, but they always have a QUANTITY - refusing to invent a weight is '
  'not a licence to report no number.';;
