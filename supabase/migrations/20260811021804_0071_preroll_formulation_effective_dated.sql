-- ---------------------------------------------------------------------------
-- 0071 — Pre-roll formulation, EFFECTIVE-DATED and editable.
--
-- Owner 11 Aug 2026: "THE FORMULA CAN CHANGE FROM TIME TO TIME DEPENDING ON
-- INVENTORY ... I AM LEANING TO 50/50 AND WE HAVE TO ALLOW US TO UPDATE THIS
-- REGULARLY."
--
-- So it CANNOT be a constant. A single ratio applied to all history would silently
-- restate every past period the next time it is edited. Each row carries the window
-- it applies to; the material calculation picks the formulation in force on the
-- ORDER DATE. Editing the future never rewrites the past.
--
-- PREMIUM is deliberately absent: Twisted Buds pure flower takes no formulation.
-- ---------------------------------------------------------------------------
create table if not exists preroll_formulation (
  id             bigserial primary key,
  brand          text not null,
  effective_from date not null,
  effective_to   date,                       -- null = still in force
  flower_pct     numeric not null check (flower_pct between 0 and 1),
  trim_pct       numeric not null check (trim_pct between 0 and 1),
  set_by         text not null,
  note           text,
  updated_at     timestamptz not null default now(),
  constraint formulation_sums_to_one check (abs(flower_pct + trim_pct - 1) < 0.0001),
  constraint no_overlap_per_brand exclude using gist (
    brand with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') with &&)
);

comment on table preroll_formulation is
  'Flower:trim split for pre-rolls, by brand, over time. The mix changes with what '
  'inventory is available, so it is effective-dated: editing it going forward never '
  'restates a past period. PREMIUM (Twisted Buds) is NOT listed - pure flower takes '
  'no formulation. An overlap constraint makes two conflicting rows impossible.';

insert into preroll_formulation (brand, effective_from, effective_to, flower_pct, trim_pct, set_by, note)
values ('Twisted', date '2024-01-01', null, 0.50, 0.50,
        'Owner (Vinny), 11 Aug 2026',
        'Owner: "LETS DO 50/50 ... I AM LEANING TO 50/50". The worksheet also carries a '
        '30/70 B-grade formulation (Summary Q20) which is NOT in force. Applied from the '
        'start of trading because no earlier split was stated; if the mix was different in '
        'an earlier period, close this row and add the correct one rather than editing it.')
on conflict do nothing;

create or replace function f_preroll_formulation(p_brand text, p_on date)
returns table (flower_pct numeric, trim_pct numeric, set_by text)
language sql stable as $$
  select f.flower_pct, f.trim_pct, f.set_by
  from preroll_formulation f
  where f.brand = p_brand
    and p_on >= f.effective_from
    and (f.effective_to is null or p_on < f.effective_to)
  limit 1;
$$;

grant select on preroll_formulation to authenticated;
grant execute on function f_preroll_formulation to authenticated;


-- Wire the formulation into the material calculation, dated on the ORDER DATE.
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
  select l.*, coalesce(bt.tier,'OTHER') as tier, bt.material as tier_material,
         fm.flower_pct, fm.trim_pct, fm.set_by as formulation_set_by
  from l
  left join product_brand_tier bt on bt.brand = l.brand
  left join lateral f_preroll_formulation(l.brand, l.order_date) fm on true)
select order_date, invoice_number, buyer, brand, tier, tier_material,
       apex_category, product_name, strain, units, price_per_unit,
       round((case
         when apex_category='Preroll' and tier='PREMIUM'
              then units * coalesce(g_per_preroll,(select value from y where key='preroll_premium_grams'))
                   * (select value from y where key='preroll_premium_flower_pct')
         when apex_category='Preroll' and flower_pct is not null
              then units * coalesce(g_per_preroll,1) * flower_pct
         when apex_category='Prepack' then units * pack_g
         end / 453.59237)::numeric,3)                              as flower_lb,
       round((case when apex_category='Preroll' and tier<>'PREMIUM' and trim_pct is not null
                   then units * coalesce(g_per_preroll,1) * trim_pct
              end / 453.59237)::numeric,3)                         as trim_lb,
       round((case when apex_category in ('Cartridge','Extract')
                   then units * unit_size_g end / 453.59237)::numeric,3) as concentrate_lb,
       case
         when apex_category='Preroll' and tier='PREMIUM' then 'Pure flower, 1 g, no formulation'
         when apex_category='Preroll' and flower_pct is not null
              then 'Formulation ' || round(flower_pct*100) || '/' || round(trim_pct*100)
                   || ' flower:trim in force on the order date — ' || formulation_set_by
         when apex_category='Preroll' then 'FORMULATION NOT SET for this brand'
         when apex_category='Prepack' and pack_g is not null
              then 'Our own packaged flower (A Bud), ' || pack_g || ' g per unit'
         when apex_category='Prepack' then 'PACK SIZE NOT IN THE PRODUCT NAME — not defaulted'
         when apex_category in ('Cartridge','Extract') then 'Finished oil weight. Input material NOT added — that would double-dip.'
         when apex_category='Flower' then 'Sold by the pound; no conversion'
         else 'No material model for this category' end            as basis,
       ptype                                                       as product_type,
       pack_g                                                      as pack_size_g
from t;

grant select on v_material_requirement to authenticated;
;
