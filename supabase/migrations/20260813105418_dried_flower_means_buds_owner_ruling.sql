-- Agent I, 13 Aug 2026. DBI-105.
--
-- OWNER RULING, verbatim: "yes dried flower because it is sold as bulk flower (buds a, b, c) or
-- premium flower 3.5 grams we will have other flower skus".
--
-- WHAT WAS WRONG. v_stock_headline.dried_lb was defined as "every category that is NOT Fresh
-- Frozen Flower" - a definition by exclusion, which quietly swept in everything that was not
-- explicitly excluded. Measured today: 2,040.0 lb published against 1,015.5 lb of actual dried
-- flower. The 1,024.5 lb difference is shake and trim, concentrate and pre-rolls, EACH OF WHICH
-- IS ALSO PUBLISHED ON ITS OWN TILE - so the same pounds were counted twice on one screen.
--
-- The owner ordered the wet/dry split precisely so a stock figure could not overstate. Defining
-- the larger half by exclusion reintroduced the same error one step later, which is why this is
-- a definition change and not a rename.
--
-- DEFINED BY THE METRC CATEGORY, NOT BY A NAME LIST, and that is the point of his last six words.
-- "we will have other flower skus" - a new bulk grade or a new 3.5 g pack must land in this
-- figure the day it is created, with nobody editing anything. Metrc's own ProductCategoryName
-- carrying "bud" is the test, so a new Buds SKU is included automatically and a new concentrate
-- is not. A hardcoded SKU list would have been wrong within a week.
--
-- NOTHING IS DROPPED, IT IS NAMED. The 1,024.5 lb does not vanish - it is published as its own
-- three columns, appended below, so the page can show the composition rather than leaving a
-- reader to wonder where the rest of the stock went. A figure that shrinks with no explanation is
-- its own kind of wrong.
--
-- COLUMNS 1-7 KEEP THEIR NAMES, TYPES AND ORDER. Only dried_lb's EXPRESSION changes, which
-- create-or-replace permits; four columns are appended.
--
-- VERIFY AFTER APPLY: dried_lb must read ~1,015.5 and dried + shake_trim + concentrate +
-- prerolls + fresh_frozen_wet must reconcile to the full weight-bearing total.
-- UNDO: restore the body from headline_stock_split_dried_from_fresh_frozen.

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
  -- OWNER RULING 13 Aug 2026: dried flower is BUDS. Bulk grades A/B/C and premium 3.5 g packs
  -- are all Buds in Metrc; shake, trim, concentrate and pre-rolls are not, and each has its own
  -- tile. Matched on the Metrc category so a new flower SKU is included the day it exists.
  round(sum(lb) filter (where category ilike '%bud%'),1)                 as dried_lb,
  round(sum(lb) filter (where category ilike '%fresh frozen%'),1)        as fresh_frozen_wet_lb,
  count(*)     filter (where category ilike '%fresh frozen%')            as fresh_frozen_packages,
  (select ratio from f)                                                  as configured_ratio,
  round(sum(lb) filter (where category ilike '%fresh frozen%') / (select ratio from f),1)
                                                                         as fresh_frozen_dry_equivalent_lb,
  'DRIED FLOWER MEANS BUDS — bulk grades A/B/C and premium 3.5 g packs. Shake and trim, '
  'concentrate and pre-rolls are NOT dried flower and each carries its own figure below; before '
  '13 Aug 2026 this number was defined as "not fresh frozen" and swept all three in, counting '
  '1,024.5 lb twice on one screen. DRIED AND FRESH FROZEN ARE STILL NEVER ADDED: dried flower is '
  'dry weight, fresh frozen is packaged at field moisture and is mostly water.'
                                                                         as why_two_figures,
  'The dry-equivalent shown here uses the CONFIGURED ratio of ' || (select ratio from f)::text ||
  ', which is not yet confirmed — measured extraction gives 4.17. Show it only beside this '
  'caveat, never as the headline number.'                                as ratio_caveat,
  -- appended 13 Aug 2026, DBI-105: the rest of the stock, named rather than dropped
  round(sum(lb) filter (where category ilike '%shake%' or category ilike '%trim%'),1)
                                                                         as shake_and_trim_lb,
  round(sum(lb) filter (where category ilike '%concentrate%'),1)         as concentrate_lb,
  round(sum(lb) filter (where category ilike '%roll%'),1)                as prerolls_lb,
  round(sum(lb),1)                                                       as all_weight_bearing_lb
from base;

comment on view public.v_stock_headline is
 'The stock figures, each meaning exactly what it says. DRIED FLOWER IS BUDS — owner ruling 13 '
 'Aug 2026: "dried flower because it is sold as bulk flower (buds a, b, c) or premium flower 3.5 '
 'grams we will have other flower skus". Matched on Metrc''s own ProductCategoryName rather than '
 'a SKU list, so a new grade or pack size is counted the day it is created and a concentrate '
 'never is. Until today dried_lb meant "not fresh frozen" and read 2,040.0 lb against 1,015.5 lb '
 'of real dried flower — the 1,024.5 lb difference being shake/trim, concentrate and pre-rolls, '
 'each already published on its own tile, so the same pounds appeared twice. Those three are now '
 'columns here, because a figure that shrinks with no explanation is its own kind of wrong. '
 'Dried and fresh frozen are never added: one is dry weight, the other is mostly water.';;
