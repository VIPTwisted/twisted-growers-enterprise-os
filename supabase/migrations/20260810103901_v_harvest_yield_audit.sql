-- Owner, 10 Aug 2026: "we rely on this to audit each and force cultivation to fix yields,
-- figure out why yields are short the 380 lbs and to keep them honest as we have had major
-- lying to owners."
--
-- ⚠ READ THIS BEFORE USING IT IN A CONFRONTATION.
--
-- THE MASS BALANCE CANNOT CATCH A LIE. Metrc computes moisture loss as the RESIDUAL of
-- wet minus waste minus packaged. It therefore closes to zero on every harvest by
-- construction, including a dishonest one. "It balances" is not evidence of anything and
-- must never be presented as such. That is a check that cannot fail (rule C0b).
--
-- WHAT CAN CATCH IT is the relationship between numbers a PERSON types and the one Metrc
-- enforces:
--   wet weight   - typed at takedown from a scale reading. Manipulable.
--   plant count  - typed. Manipulable.
--   packaged     - NOT freely typed: every pound becomes a tagged package in Metrc with its
--                  own label, and it is the hardest number in the chain to inflate.
--   moisture %   - not typed at all. It is derived, so it MOVES when either of the first two
--                  is manipulated. That is what makes it useful.
--
-- Measured across 273 dried harvests on 10 Aug 2026: wet weight per plant varies 32.1%, but
-- dry yield per plant varies 53.9% - 1.7 times more. Plants deliver consistent wet weight;
-- the variation enters AFTER the scale. That is the fact this view exists to localise.

create or replace view v_harvest_yield_audit as
with base as (
  select v.harvest, v.strain, v.room, v.finished_on, v.licence, v.plants,
         v.wet_in_lb, v.waste_lb, v.water_lost_lb, v.dry_yield_lb, v.water_pct,
         v.harvest_state, v.drying_kind,
         v.wet_in_lb   * 453.592 / nullif(v.plants,0) as wet_g_plant,
         v.dry_yield_lb* 453.592 / nullif(v.plants,0) as dry_g_plant
  from v_harvest_water_and_yield v
  where v.harvest_state = 'CLOSED' and v.drying_kind = 'dried' and coalesce(v.plants,0) > 0
),
strain_norm as (
  select strain,
         percentile_cont(0.5) within group (order by dry_g_plant) as strain_median_dry_g,
         count(*) as strain_harvests
  from base group by strain
)
select
  b.harvest, b.strain, b.room, b.finished_on, b.licence, b.plants,
  round(b.wet_in_lb::numeric,1)    as wet_in_lb,
  round(b.dry_yield_lb::numeric,1) as dry_yield_lb,
  round(b.wet_g_plant::numeric,1)  as wet_g_per_plant,
  round(b.dry_g_plant::numeric,1)  as dry_g_per_plant,
  round(b.water_pct::numeric,1)    as water_pct,

  -- against the owner-set target
  round((b.plants * 70.6 / 453.592)::numeric,1)                      as expected_dry_lb_at_target,
  round((b.dry_yield_lb - b.plants * 70.6 / 453.592)::numeric,1)     as vs_target_lb,
  round(((b.dry_yield_lb - b.plants * 70.6 / 453.592) * 1100)::numeric,0) as vs_target_dollars,

  -- against the strain's OWN history, which controls for genetics
  round(s.strain_median_dry_g::numeric,1)                            as strain_median_dry_g,
  s.strain_harvests,
  round((b.dry_g_plant - s.strain_median_dry_g)::numeric,1)          as vs_own_strain_g,

  -- the tell: which number moved
  case
    when b.water_pct between 70 and 77 and b.dry_g_plant >= 70.6
      then 'OK - water in band, yield at target'
    when b.water_pct between 70 and 77 and b.dry_g_plant < 70.6
      then 'YIELD SHORT, drying normal. The plants or the grow underperformed - not the dry room'
    when b.water_pct > 77 and b.dry_g_plant < 70.6
      then 'CHECK: more weight vanished in drying than drying explains, AND the yield is short. '
           || 'Either the wet weight was overstated at takedown or material left after weighing'
    when b.water_pct > 77 and b.dry_g_plant >= 70.6
      then 'water above band but yield is fine - wet weight likely overstated at takedown'
    when b.water_pct < 70 and b.dry_g_plant < 70.6
      then 'CHECK: too little water lost for a dried harvest AND yield short - the wet weight '
           || 'may have been understated to make a poor yield look normal'
    when b.water_pct < 70
      then 'water below band - wet weight may be understated, though yield is at target'
    else 'review'
  end                                                                 as audit_verdict,

  case
    when b.dry_g_plant < 25                     then 'SEVERE - under 25 g per plant'
    when b.dry_g_plant < 50                     then 'HIGH - under half target'
    when b.dry_g_plant < 70.6                   then 'watch - below target'
    else 'none' end                                                   as concern,

  b.harvest || ' in ' || coalesce(b.room,'an unrecorded room') || ': ' || b.plants
    || ' plants gave ' || round(b.dry_yield_lb::numeric,1) || ' lb dry = '
    || round(b.dry_g_plant::numeric,1) || ' g per plant against the 70.6 g target ('
    || case when b.dry_yield_lb >= b.plants*70.6/453.592 then 'ahead by ' else 'short by ' end
    || round(abs(b.dry_yield_lb - b.plants*70.6/453.592)::numeric,1) || ' lb, '
    || case when b.dry_yield_lb >= b.plants*70.6/453.592 then '+' else '-' end || '$'
    || round(abs((b.dry_yield_lb - b.plants*70.6/453.592)*1100)::numeric,0)
    || '). Water loss was ' || round(b.water_pct::numeric,1)
    || '% against the 70-77% band. This strain''s own median is '
    || round(s.strain_median_dry_g::numeric,1) || ' g per plant across '
    || s.strain_harvests || ' harvests.'                              as in_plain_english
from base b
join strain_norm s on s.strain = b.strain;

comment on view v_harvest_yield_audit is
  'Per-harvest yield accountability. ⚠ The mass balance CANNOT catch a lie - Metrc derives '
  'moisture as a residual so it always closes, including on a dishonest harvest. This view '
  'instead compares the numbers a person types (wet weight, plant count) against the one Metrc '
  'enforces (packaged, which becomes tagged packages), and uses the derived water percentage as '
  'the tell: it moves when either typed number is manipulated. Every harvest is also compared '
  'to its OWN strain median, which controls for genetics.';;
