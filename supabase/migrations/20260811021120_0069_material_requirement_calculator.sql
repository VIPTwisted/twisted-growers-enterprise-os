-- ---------------------------------------------------------------------------
-- 0069 — Material requirement from sales, using the owner's calculator.
--
-- PREMIUM (Twisted Buds) pre-rolls take NO FORMULATION: they are pure flower,
-- 1 g. Owner 11 Aug 2026: "YOU ARE MISSING THE TWISTED BUDS PURE FLOWER BECAUSE IT
-- DID NOT NEED FORMULA" / "THEY WERE 1G PREROLLS". The 50/50 and 30/70 flower:trim
-- formulations on the worksheet are B-GRADE only and must never be applied to
-- premium.
-- ---------------------------------------------------------------------------
insert into production_yield_standard (key, process, value, unit, label, source_cell, what_it_means) values
 ('preroll_premium_flower_pct','Pre-roll',1.00,'ratio','PREMIUM pre-roll, flower share',
  'Owner 11 Aug 2026',
  '100% flower, no trim, no formulation. Twisted Buds pure flower pre-rolls at 1 g. '
  'The 50/50 and 30/70 formulations are B-grade only.'),
 ('preroll_premium_grams','Pre-roll',1.00,'g','PREMIUM pre-roll size',
  'Owner 11 Aug 2026','Twisted Buds pure flower pre-rolls are 1 g.')
on conflict (key) do update set
  value=excluded.value, label=excluded.label, source_cell=excluded.source_cell,
  what_it_means=excluded.what_it_means, updated_at=now();

-- Material required to make what we actually SOLD, line by line.
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
       -- FLOWER drawn, in pounds
       round((case
         when apex_category='Preroll' and tier='PREMIUM'
              then units * coalesce(g_per_preroll,(select value from y where key='preroll_premium_grams'))
                   * (select value from y where key='preroll_premium_flower_pct')
         when apex_category='Preroll'
              then units * coalesce(g_per_preroll,1) * null      -- formulation NOT SET for economy
         when apex_category='Prepack'
              then units * coalesce(substring(product_name from '([0-9]+\.?[0-9]*)\s*[gG]\b')::numeric,3.5)
         end / 453.59237)::numeric,3)                              as flower_lb,
       -- TRIM drawn, in pounds
       round((case
         when apex_category='Preroll' and tier<>'PREMIUM'
              then units * coalesce(g_per_preroll,1) * null       -- formulation NOT SET for economy
         end / 453.59237)::numeric,3)                              as trim_lb,
       -- CONCENTRATE drawn, in pounds (the finished oil, NOT its input material)
       round((case when apex_category in ('Cartridge','Extract')
                   then units * unit_size_g end / 453.59237)::numeric,3) as concentrate_lb,
       case
         when apex_category='Preroll' and tier='PREMIUM' then 'Pure flower, 1 g, no formulation'
         when apex_category='Preroll' then 'FORMULATION NOT SET — owner must state 50/50 or 30/70 for this brand'
         when apex_category='Prepack' then 'Pack size read from the product name'
         when apex_category in ('Cartridge','Extract') then 'Finished oil weight. Input material NOT added here — that would double-dip.'
         when apex_category='Flower' then 'Sold by the pound; no conversion'
         else 'No material model for this category' end            as basis
from t;

comment on view v_material_requirement is
  'Material drawn by what we SOLD, from the owner''s Manufacturing Production '
  'Worksheet. PREMIUM pre-rolls are pure flower at 1 g with NO formulation. '
  'ECONOMY pre-roll formulation is DELIBERATELY NULL until the owner states whether '
  'it is 50/50 or 30/70 — both are on the worksheet and guessing would corrupt the '
  'cost of materials. Concentrate shows the FINISHED OIL weight only: adding the '
  'fresh frozen and trim that made it would double-dip the cost of materials '
  '(owner ruling, conversion_factors.material_no_double_dip_concentrate).';

grant select on v_material_requirement to authenticated;
;
