/* THE 26 % FLOOR IS A FLOWER RULE — caught by challenging my own first result
 * before it reached the owner, 19 Aug 2026.
 *
 * v_strain_gate's first run said 29 strains averaged below the floor, with
 * minimums of 2.9 %, 3.3 %, 5.5 %. A flower certificate does not come back at
 * 2.9 % THC, so the population was wrong, and it was:
 *
 *   Buds                537 COAs   avg 25.0 %   range 8.8 - 38.5
 *   Concentrate (Bulk)  153 COAs   avg 71.4 %   — would falsely PASS
 *   Shake/Trim (strain)  32 COAs   avg 22.3 %   — a by-product, not flower
 *   Fresh Frozen Flower  14 COAs   avg  4.6 %   — WET mass, mostly water
 *   Infused (edible)     15 COAs   avg  0.1 %   — % of an edible's mass
 *   Vape Product         11 COAs   avg 90.3 %
 *
 * Averaging those together answers no question anybody asked. The owner's rule
 * — "no strain below 26 % THC" — is about the flower he grows and sells, so the
 * gate measures BUDS and RAW PRE-ROLLS only. Existing column names and their
 * ORDER are untouched (rule E1); the three new columns append at the end. */

create or replace view public.v_strain_gate as
with potency as (
  select coalesce(p.raw #>> '{Item,StrainName}', 'unknown') as strain,
         count(*) filter (where c.total_thc is not null)          as coas,
         round(avg(c.total_thc)::numeric, 2)                      as avg_thc,
         round(min(c.total_thc)::numeric, 2)                      as min_thc,
         round(max(c.total_thc)::numeric, 2)                      as max_thc,
         count(*) filter (where c.total_thc < f_rule('strain_min_thc_percent')) as coas_under_floor,
         max(c.report_date)                                       as latest_coa
  from coa_extract c
  join (select distinct on (d.tag) d.tag, d.raw from metrc_packages d
        order by d.tag, d.synced_at desc nulls last) p on p.tag = c.package_tag
  where c.total_thc is not null
    and coalesce(p.raw #>> '{Item,ProductCategoryName}','') in ('Buds','Raw Pre-Rolls')
  group by 1
),
other_cat as (
  select coalesce(p.raw #>> '{Item,StrainName}', 'unknown') as strain,
         count(*) as coas_other_products
  from coa_extract c
  join (select distinct on (d.tag) d.tag, d.raw from metrc_packages d
        order by d.tag, d.synced_at desc nulls last) p on p.tag = c.package_tag
  where c.total_thc is not null
    and coalesce(p.raw #>> '{Item,ProductCategoryName}','') not in ('Buds','Raw Pre-Rolls')
  group by 1
),
yield as (
  select h.strain,
         count(*) filter (where h.harvest_closed is not null)     as closed_harvests,
         round(avg(h.packaged_g_per_plant) filter (where h.harvest_closed is not null)::numeric, 1) as avg_g_per_plant,
         round((avg(h.packaged_g_per_plant) filter (where h.harvest_closed is not null) / 453.59237)::numeric, 4) as avg_lb_per_plant,
         round(avg(h.packaged_lb) filter (where h.harvest_closed is not null)::numeric, 1) as avg_pull_lb
  from v_harvest_forensic h where coalesce(h.strain,'') <> '' group by 1
)
select st.name                          as strain,
       st.active_flag,
       st.min_allowed_thc_percent       as thc_floor,
       p.coas,
       p.avg_thc,
       p.min_thc,
       p.coas_under_floor,
       p.latest_coa,
       st.target_yield_per_plant_lb     as yield_target_lb,
       y.closed_harvests,
       y.avg_lb_per_plant,
       y.avg_pull_lb,
       f_rule('required_lb_per_pull')   as pull_floor_lb,
       case
         when p.coas is null                                     then 'NO FLOWER POTENCY EVIDENCE — no Buds certificate carries a THC figure for this strain'
         when p.avg_thc < st.min_allowed_thc_percent             then 'BELOW THE FLOOR — flower averages ' || p.avg_thc || ' % across ' || p.coas || ' certificates, against a ' || st.min_allowed_thc_percent || ' % minimum'
         when p.coas_under_floor > 0                             then 'MIXED — ' || p.coas_under_floor || ' of ' || p.coas || ' flower certificates came in under the floor (average ' || p.avg_thc || ' %)'
         else 'MEETS THE POTENCY RULE — averages ' || p.avg_thc || ' %'
       end                              as potency_verdict,
       case
         when y.closed_harvests is null                          then 'NO YIELD HISTORY — no closed harvest of this strain'
         when st.target_yield_per_plant_lb is null               then 'NO OWNER TARGET SET — measured ' || coalesce(y.avg_lb_per_plant::text,'?') || ' lb per plant across ' || y.closed_harvests || ' harvests'
         when y.avg_lb_per_plant < st.min_allowed_yield_per_plant_lb then 'UNDER THE YIELD MINIMUM'
         else 'MEETS THE YIELD RULE'
       end                              as yield_verdict,
       case
         when p.coas >= 5 and p.avg_thc < st.min_allowed_thc_percent and st.active_flag
           then 'RECOMMEND DISABLING — flower potency below the company floor on ' || p.coas || ' certificates'
         when p.coas between 1 and 4 and p.avg_thc < st.min_allowed_thc_percent and st.active_flag
           then 'WATCH — under the floor, but only ' || p.coas || ' certificate(s); too few to disable on'
         when st.low_scoring_historically and st.active_flag
           then 'RECOMMEND DISABLING — flagged low scoring'
         when not st.active_flag then 'Already disabled'
         else 'No action'
       end                              as recommendation,
       p.max_thc,
       coalesce(o.coas_other_products,0) as other_product_coas,
       'FLOWER ONLY (Buds, Raw Pre-Rolls). Fresh frozen is wet mass at ~4.6 %, shake/trim ~19-22 %, concentrate ~71 %, vape ~90 %, edibles ~0.1 % — none comparable to a flower floor.'::text as potency_basis
from strain st
left join potency p   on p.strain = st.name
left join other_cat o on o.strain = st.name
left join yield y     on y.strain = st.name;

comment on view public.v_strain_gate is
  'Every strain against the owner rules (master build §8/§11). POTENCY IS MEASURED ON FLOWER ONLY '
  '(Buds, Raw Pre-Rolls) — `coas` counts flower certificates. Fresh frozen is wet mass at ~4.6 %, '
  'shake/trim a by-product at ~19-22 %, concentrate and vape 70-90 %, edibles 0.1 % of a brownie; '
  'blending them against a flower floor answers no question anybody asked, and the first run of '
  'this view did exactly that before being challenged. A disable is recommended only on 5+ flower '
  'certificates; fewer is a WATCH. Agent I, 19 Aug 2026.';

insert into public.data_quirk (quirk_key, headline, what_you_see, why_it_happens, is_it_a_defect, the_measurement, affects, found_on, found_by)
values ('thc_percent_is_not_comparable_across_categories',
 'THC percent is not comparable across product categories — the 26 % floor is a FLOWER rule',
 'Strain potency figures that look catastrophically low: minimums of 2.9 %, 3.3 %, 5.5 % against the owner''s 26 % floor.',
 'Percent is a ratio to the product it sits in. Fresh frozen is weighed WET and is mostly water (~4.6 %); an infused edible is mostly food (~0.1 %); a concentrate has had the plant removed (~71 %); shake and trim is a by-product (~19-22 %). Every number is correct — the COMPARISON is wrong.',
 false,
 'Buds 537 COAs avg 25.0 % (8.8-38.5) · Concentrate (Bulk) 153 avg 71.4 % · Shake/Trim (by strain) 32 avg 22.3 % · Shake/Trim 23 avg 19.2 % · Infused (edible) 15 avg 0.1 % · Fresh Frozen Flower 14 avg 4.6 % · Raw Pre-Rolls 14 avg 25.9 % · Vape 11 avg 90.3 %',
 array['v_strain_gate','any strain potency figure','any COA average','strain approval decisions'],
 current_date,
 'Agent I — caught challenging its own first strain-gate result before it reached the owner')
on conflict (quirk_key) do nothing;;
