-- ---------------------------------------------------------------------------
-- 0070 — Pack size never actually parsed. Postgres reads \b as BACKSPACE; the word
-- boundary is \y. Proven: substring('... Flower 3.5g ...' from '([0-9.]+)\s*[gG]\y')
-- returns 3.5, the \b form returns NULL. Every Prepack row silently fell through to
-- a hardcoded 3.5 default.
--
-- The answer happened to be right - owner confirmed 11 Aug 2026 that Twisted Buds
-- Prepack IS our own packaged 3.5 g flower ("OUR A BUDS"), and all 2,947 lines are
-- product type "A Bud" named "<Strain> Flower 3.5g" - but it was right by luck.
-- Now it parses, and anything that does not parse is LABELLED, never defaulted.
--
-- product_type is APPENDED (CREATE OR REPLACE cannot reorder columns).
-- ---------------------------------------------------------------------------
create or replace view v_material_requirement as
with y as (select key, value from production_yield_standard),
l as (
  select (o.payload->>'order_date')::date                       as order_date,
         o.payload->>'invoice_number'                           as invoice_number,
         o.payload->'buyer'->>'name'                            as buyer,
         it->'brand'->>'name'                                   as brand,
         it->'product_category'->>'name'                        as apex_category,
         it->>'product_name'                                    as product_name,
         it->'cultivar'->>'name'                                as strain,
         case when it->'order_unit_measurement'->>'name'='Case'
              then coalesce((it->>'order_quantity')::numeric,0)
                   * coalesce(nullif(it->>'units_per_case','')::numeric,1)
              else coalesce((it->>'order_quantity')::numeric,0) end as units,
         nullif(it->>'gram_per_preroll','')::numeric             as g_per_preroll,
         nullif(it->>'unit_size','')::numeric                    as unit_size_g,
         substring(it->>'product_name' from '([0-9]+\.?[0-9]*)\s*[gG]\y')::numeric as pack_g,
         it->'product_type'->>'name'                             as ptype,
         (coalesce((it->>'order_price_raw')::numeric,0)/100.0)
           / nullif(coalesce(nullif(it->>'units_per_case','')::numeric,1),0) as price_per_unit
  from apex_raw o
  join lateral jsonb_array_elements(coalesce(o.payload->'items','[]'::jsonb)) it on true
  where o.entity='shipping-orders'
    and not coalesce((o.payload->>'cancelled')::boolean,false)),
t as (
  select l.*, coalesce(bt.tier,'OTHER') as tier, bt.material as tier_material
  from l left join product_brand_tier bt on bt.brand = l.brand)
select order_date, invoice_number, buyer, brand, tier, tier_material,
       apex_category, product_name, strain, units, price_per_unit,
       round((case
         when apex_category='Preroll' and tier='PREMIUM'
              then units * coalesce(g_per_preroll,(select value from y where key='preroll_premium_grams'))
                   * (select value from y where key='preroll_premium_flower_pct')
         when apex_category='Prepack' then units * pack_g
         end / 453.59237)::numeric,3)                              as flower_lb,
       null::numeric                                               as trim_lb,
       round((case when apex_category in ('Cartridge','Extract')
                   then units * unit_size_g end / 453.59237)::numeric,3) as concentrate_lb,
       case
         when apex_category='Preroll' and tier='PREMIUM' then 'Pure flower, 1 g, no formulation'
         when apex_category='Preroll' then 'FORMULATION NOT SET — owner must state the flower:trim split'
         when apex_category='Prepack' and pack_g is not null
              then 'Our own packaged flower (A Bud), ' || pack_g || ' g per unit, read from the product name'
         when apex_category='Prepack' then 'PACK SIZE NOT IN THE PRODUCT NAME — not defaulted'
         when apex_category in ('Cartridge','Extract') then 'Finished oil weight. Input material NOT added — that would double-dip.'
         when apex_category='Flower' then 'Sold by the pound; no conversion'
         else 'No material model for this category' end            as basis,
       ptype                                                       as product_type,
       pack_g                                                      as pack_size_g
from t;

update product_brand_tier
   set note = note || ' CONFIRMED by owner 11 Aug 2026: the Apex "Prepack" category is '
              'our own packaged 3.5 g flower — "OUR A BUDS". All 2,947 lines are product '
              'type "A Bud", named "<Strain> Flower 3.5g", 159,519 units = 1,230.9 lb.',
       updated_at = now()
 where brand = 'Twisted Buds';

grant select on v_material_requirement to authenticated;
;
