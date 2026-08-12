-- to_char(1933, 'FM999G999G990D99') renders '1,933.' - FM strips the trailing
-- zeros but leaves the decimal POINT. A quantity printed as "1,933. ea" in front of
-- an owner is the kind of thing that makes a correct number look untrustworthy.
-- Whole counts print whole; fractional counts keep two places.

create or replace function public.f_quantity_text(p_qty numeric, p_uom text)
returns text language sql immutable as $$
  select case
    when p_qty is null then null
    when f_is_weight(p_uom)
      then trim(to_char(round(f_to_pounds(p_qty, p_uom), 2), 'FM999G999G990D99')) || ' lb'
    when p_qty = trunc(p_qty)
      then trim(to_char(p_qty, 'FM999G999G990')) || ' ' || p_uom
    else trim(to_char(p_qty, 'FM999G999G990D99')) || ' ' || p_uom
  end;
$$;

comment on function public.f_quantity_text(numeric, text) is
  'Renders a quantity with its unit: "12.5 lb" for weight, "1,933 ea" for a count. '
  'Use this rather than a pounds column alone - a pounds-only figure silently drops '
  'every countable item, and on 7 Aug 2026 that hid 18,822 units across 143 active '
  'packages. Refusing to invent a weight is not a licence to report no number.';

create or replace view public.v_countable_inventory as
select p.tag                          as package_tag,
       left(p.item_name, 55)          as item_name,
       p.license,
       p.uom                          as unit_of_measure,
       p.quantity                     as units,
       f_quantity_text(p.quantity, p.uom) as how_much,
       p.source_state,
       p.raw->>'LocationName'         as location,
       p.raw->>'ItemFromFacilityName' as item_defined_by,
       f_is_weight(p.uom)             as is_weight_based,
       'THE ISSUE: this item is counted, not weighed. Any figure built on pounds '
       'alone excludes it entirely and the total will be wrong without saying so.'
                                      as what_is_wrong,
       'Report units and pounds SEPARATELY, or use f_quantity_text(). Never publish '
       'a row with no quantity on it, and never add units to pounds.'
                                      as what_to_do
from (select distinct on (tag) tag, item_name, license, uom, quantity, source_state, raw
      from metrc_packages order by tag, license) p
where not f_is_weight(p.uom)
  and p.source_state = any (array['active','onhold'])
  and coalesce(p.quantity, 0) > 0;;
