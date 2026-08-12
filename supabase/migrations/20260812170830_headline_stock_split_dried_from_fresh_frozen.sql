-- Agent I, 12 Aug 2026. DBI-063.
-- OWNER APPROVED, verbatim: "AGREE SPLIT THIS".
--
-- Two figures, never added. Dried flower pounds are dry pounds; fresh frozen is packaged at field
-- moisture and is mostly water. Adding them produced "2,460.0 lb dry-equivalent", overstated by
-- 325.3 lb / 13.2%, and at dried-flower pricing that implied roughly $357,830 of stock that does
-- not exist. Confirmed three ways tonight: the view applies no conversion; the arithmetic closes
-- exactly (2,041.7 + 418.3 = 2,460.0); and the Manufacturing tile already publishes 93.0 lb
-- dry-equivalent for the identical eight packages.
--
-- THE SPLIT NEEDS NO RATIO, which is why it is the right fix now: 4.5 is configured and 4.17 is
-- measured, and that is unsettled until enough extraction runs decide it. Nothing here converts
-- anything. dry_equivalent_at_configured_ratio is offered as a CLEARLY LABELLED third figure the
-- front end may show only beside its ratio and its unconfirmed status - never as the headline.
--
-- UNDO: drop view v_stock_headline.

create or replace view public.v_stock_headline as
with base as (
  select coalesce(nullif(raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
         (raw->>'Quantity')::numeric / 453.59237                          as lb
  from metrc_packages
  where not coalesce((raw->>'IsFinished')::boolean,false)
    and coalesce((raw->>'Quantity')::numeric,0) > 0
    and lower(coalesce(raw->>'UnitOfMeasureName','')) in ('grams','g')
),
f as (select value::numeric as ratio from conversion_factors where key='fresh_frozen_wet_to_dry')
select
  round(sum(lb) filter (where category <> 'Fresh Frozen Flower'),1)  as dried_lb,
  round(sum(lb) filter (where category =  'Fresh Frozen Flower'),1)  as fresh_frozen_wet_lb,
  count(*)     filter (where category =  'Fresh Frozen Flower')      as fresh_frozen_packages,
  (select ratio from f)                                              as configured_ratio,
  round(sum(lb) filter (where category = 'Fresh Frozen Flower') / (select ratio from f),1)
                                                                     as fresh_frozen_dry_equivalent_lb,
  'DRIED AND FRESH FROZEN ARE NOT ADDED. Dried flower is dry weight. Fresh frozen is packaged at '
  'field moisture and is mostly water, so the two cannot be summed into one pound figure. Owner '
  'ruling 12 Aug 2026 after the combined tile was found overstated by 325.3 lb.'
                                                                     as why_two_figures,
  'The dry-equivalent shown here uses the CONFIGURED ratio of ' ||
  (select ratio from f)::text ||
  ', which is not yet confirmed — measured extraction gives 4.17. Show it only beside this '
  'caveat, never as the headline number.'                            as ratio_caveat
from base;

comment on view public.v_stock_headline is
 'The headline stock figures, SPLIT. Owner approved 12 Aug 2026 ("AGREE SPLIT THIS") after the '
 'combined "Total on hand, dry-equivalent" tile was found to be adding 418.3 lb of fresh frozen '
 'at wet weight into a figure it called dry-equivalent — 325.3 lb / 13.2% overstated, roughly '
 '$357,830 of stock that does not exist at dried-flower pricing. The split needs no conversion '
 'ratio, which is the point: 4.5 configured against 4.17 measured is genuinely unsettled.';;
