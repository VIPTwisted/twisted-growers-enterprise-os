-- T1 — MOISTURE LOSS, MEASURED NIGHTLY, NEVER TYPED. Owner ruling, 8 Aug 2026:
-- "it should always be accurate not a hardwired number... i could add goal if suggested."
--
-- THE OBJECTION THIS VIEW HAD TO DEFEAT. CLAUDE.md warns that moisture loss is a RESIDUAL
-- (wet - waste - packaged), so "the mass balance always closes and proves nothing". True,
-- and it is why the figure was never trusted.
--
-- FRESH FROZEN IS THE CONTROL GROUP, and it breaks the objection. FF is packaged WET and
-- never dries, yet it is computed by the identical arithmetic. Measured 8 Aug 2026:
--
--     Dried, finished  (276)  34,082 lb wet  ->  19.9% packaged,  72.8% left on the books
--     Fresh frozen     ( 74)   5,771 lb wet  ->  77.9% packaged,   1.2% left on the books
--
-- If the residual were an artifact of the formula, fresh frozen would show it too. It does
-- not. The 72.8% is water, and it sits inside the owner-set 70-77% band. That contrast is
-- the independent check the rule said was missing - a comparison that COULD have failed and
-- did not (rule C0b).
--
-- AND IT NAMES THE PHANTOM WEIGHT. Metrc's CurrentWeight is literally wet - waste -
-- packaged: TG Gush Mintz - 20250923 f1 finished on 31 Mar 2026 and Metrc still shows
-- 436.6 lb in it. The water never left the books because the drying loss was never entered.
-- So the phantom weight is not material MISSING from the state record - it is water
-- WRONGLY PRESENT in it, on 276 finished harvests. That is a recording gap, and it
-- overstates inventory to the state.
create or replace view public.v_moisture_loss as
with h as (
  select
    mh.name,
    (mh.name ~* '(^|[^a-z])FF([^a-z]|$)')            as is_fresh_frozen,
    (mh.raw->>'FinishedDate')::date                  as finished_date,
    mh.harvest_start,
    (mh.raw->>'TotalWetWeight')::numeric/453.592     as wet_lb,
    (mh.raw->>'TotalWasteWeight')::numeric/453.592   as waste_lb,
    (mh.raw->>'TotalPackagedWeight')::numeric/453.592 as packaged_lb,
    (mh.raw->>'CurrentWeight')::numeric/453.592      as still_on_books_lb
  from metrc_harvests mh
)
select
  name                as harvest_name,
  harvest_start       as takedown_date,
  finished_date,
  is_fresh_frozen,
  round(wet_lb,1)             as wet_lb,
  round(waste_lb,1)           as waste_lb,
  round(packaged_lb,1)        as packaged_lb,
  round(still_on_books_lb,1)  as still_on_books_lb,
  case when wet_lb > 0 then round(100*still_on_books_lb/wet_lb, 1) end as moisture_loss_pct,
  f_rule('moisture_loss_goal_pct') as goal_pct,
  /* Only a FINISHED, DRIED harvest can state a moisture loss. Everything else says why not
     (rule A3), and none of them are silently averaged into the figure - including the 74
     fresh-frozen harvests, which are the known trap that drags the number to a false 62.5%. */
  case
    when is_fresh_frozen
      then 'EXCLUDED - fresh frozen. Packaged wet, never dried, so it has no moisture loss. Including these is the known trap that produces a false 62.5%.'
    when finished_date is null
      then 'EXCLUDED - harvest still open. Drying is not complete, so the figure would understate the loss.'
    when wet_lb is null or wet_lb <= 0
      then 'EXCLUDED - no wet weight recorded, so no percentage can be derived (rule A1: never invent one).'
    else 'COUNTED - finished and dried.'
  end as inclusion,
  /* The same number, read the other way. This is what the state record still believes we
     hold, and it is why closed harvests carry phantom weight. */
  case
    when is_fresh_frozen or finished_date is null then null
    else round(still_on_books_lb,1)
  end as phantom_lb_still_in_metrc
from h;

comment on view public.v_moisture_loss is
  'T1, 8 Aug 2026. Moisture loss MEASURED per harvest, never typed - owner ruling: "it '
  'should always be accurate not a hardwired number". Loss is Metrc CurrentWeight as a '
  'share of wet weight. Fresh frozen (74 harvests) and open harvests are EXCLUDED and say '
  'why - including fresh frozen is the trap that yields a false 62.5%. Validated against '
  'fresh frozen as a control: identical arithmetic gives 1.2% where drying gives 72.8%, so '
  'the residual is not an artifact. The same number is the phantom weight: 24,826 lb of '
  'evaporated water still recorded in Metrc across 276 finished harvests.';;
