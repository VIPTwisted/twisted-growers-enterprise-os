-- CONTRACTED DRIED POUNDS AGAINST WHAT METRC ACTUALLY RECORDS, BY MONTH.
--
-- Owner instruction, 29 Aug 2026: this month plus the trailing twelve; sources are the
-- Metrc mirror and whatever contract number the platform ALREADY stores; do not invent a
-- contract number; if no contract row exists the view still ships with the contract
-- column NULL and evidence_status = 'missing', because that absence IS the finding.
--
-- NOT APPLIED. Branch only. Both branches were proven by running the SELECT read-only
-- against production first: with the rule row present it returns 13 months with
-- contract_lb 380; against a deliberately non-existent key it still returns 13 months
-- with contract_lb NULL and evidence_status 'missing'. READ-ONLY - a view over a view
-- and one rule row, writing nothing.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- MOST OF THIS WAS ALREADY BUILT, AND IT IS NOT REBUILT HERE.
--
-- v_yield_vs_target -> v_monthly_yield already produce a month, a dried_flower_lb and a
-- target_lb. Re-deriving dried pounds from metrc_harvests would create a SECOND
-- definition of the same primitive and the two would drift the first time either was
-- touched. So actual_dried_lb is taken straight from v_yield_vs_target.dried_flower_lb
-- and nothing about how it is computed is restated.
--
-- What that definition means, carried forward rather than paraphrased: dried flower is
-- counted from metrc_packages where the item category is 'Buds' AND SourcePackageLabels
-- is empty - packages made DIRECTLY off a harvest, because a package repackaged from
-- another package still carries the harvest name and would be counted twice.
--
-- GRAIN CAVEAT, inherited and stated rather than hidden: in v_monthly_yield the harvest
-- columns are grouped by the harvest's FinishedDate month while dried_flower_lb is
-- grouped by the package's packaged_on month. Those are two different months for the
-- same material - drying takes 10 to 14 days by the owner's own rule - so a pull cut at
-- the end of a month lands its pounds in the next one. This view compares a MONTH of
-- packaged dried flower against a MONTHLY contract, which is the right pairing, but a
-- single month's variance can be a timing artefact. Judge a run of months, not one.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE CONTRACT NUMBER EXISTS, AND IT IS NOT INVENTED HERE.
--
--   conversion_factors.monthly_min_dried_flower_lb = 380 lb
--   "The contracted floor for finished dried flower each month. Fresh frozen does not
--    count towards it."
--
-- That is the CONTRACTED FLOOR and it is what this view reads. It is deliberately not
-- monthly_target_dried_lb ("what the whole facility is expected to produce"), which also
-- reads 380 today. Same number, different promise: one is what we owe, the other is what
-- we hope for, and they can diverge the moment either is edited. A view about a contract
-- reads the contract row.
--
-- Read by LEFT JOIN rather than through f_rule(), so a deleted rule row yields NULL and
-- evidence_status 'missing' instead of raising - the behaviour the owner asked for.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A FINDING THIS VIEW SURFACES AND DELIBERATELY DOES NOT FIX.
--
-- v_monthly_yield does NOT read the rule. Its target is the literal `380::numeric`,
-- hardcoded in the view body, and the comparison and status text are hardcoded against
-- it too. So the platform holds TWO definitions of the monthly contract number: an
-- owner-editable rule row with provenance, and a constant compiled into a view. They
-- agree today only because both happen to read 380. Edit the rule and the sibling views
-- keep reporting the old figure with no warning.
--
-- The owner's instruction was explicit - do not flip sibling views - so v_monthly_yield
-- and v_yield_vs_target are untouched. Instead this view carries sibling_target_lb beside
-- contract_lb and a contract_matches_sibling flag, so the day they diverge it is visible
-- on the face of the report rather than discovered by someone reconciling by hand.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IT REFUSES TO DO.
--
--   · No month is invented and none is dropped. The thirteen months are generated, so a
--     month in which nothing was harvested still appears - with actual_dried_lb NULL and
--     actual_status saying so, never 0. Zero pounds and no record are different facts.
--   · No contract is invented. Absent rule row means NULL and 'missing'.
--   · Fresh frozen is not counted towards the contract, because the rule says it does not.
--     It is carried as context only.
--   · Nothing is written anywhere. This is a read-only view.
create or replace view public.v_harvest_contract_vs_metrc
with (security_invoker = true) as
with months as (
  /* Generated, not harvested from the data: a month with no harvest must still be a row.
     0 = the current month, 12 = eleven months before it, so thirteen in total. */
  select (date_trunc('month', current_date) - (n || ' months')::interval)::date as month_date
  from generate_series(0, 12) as n
),
contract as (
  /* One row or none. LEFT JOINed below so "none" survives as NULL rather than removing
     every month from the result. */
  select value::numeric                        as contract_lb,
         nullif(btrim(unit), '')               as contract_unit,
         nullif(btrim(set_by), '')             as contract_set_by,
         nullif(btrim(where_it_came_from), '') as contract_evidence,
         updated_at                            as contract_set_on
  from public.conversion_factors
  where key = 'monthly_min_dried_flower_lb'
)
select
  to_char(m.month_date, 'YYYY-MM')                         as month,
  m.month_date,

  /* ── what Metrc actually recorded ─────────────────────────────────────────── */
  y.dried_flower_lb                                        as actual_dried_lb,
  case
    when y.month_date is null then 'NO HARVEST MONTH IN THE MIRROR - not zero pounds, no record'
    when y.dried_flower_lb is null then 'NO DRIED FLOWER PACKAGED IN THIS MONTH'
    else 'recorded'
  end                                                      as actual_status,
  y.fresh_frozen_lb                                        as fresh_frozen_lb_context,
  y.harvests                                               as harvests_closed,

  /* ── what we are contracted to deliver ────────────────────────────────────── */
  c.contract_lb,
  case when c.contract_lb is null then 'missing' else 'owner-set' end
                                                           as evidence_status,
  c.contract_set_by,
  c.contract_evidence,

  /* ── the gap, only where both halves exist ────────────────────────────────── */
  case when y.dried_flower_lb is not null and c.contract_lb is not null
       then round(y.dried_flower_lb - c.contract_lb, 1) end as variance_lb,
  case
    when c.contract_lb is null            then 'NO CONTRACT ON FILE - nothing to judge against'
    when y.dried_flower_lb is null        then 'NO ACTUAL ON FILE - nothing to judge'
    when y.dried_flower_lb >= c.contract_lb then 'MET'
    else                                       'BELOW THE CONTRACTED FLOOR'
  end                                                      as contract_status,

  /* ── the second definition, shown so its drift cannot hide ────────────────── */
  y.target_lb                                              as sibling_target_lb,
  case
    when c.contract_lb is null or y.target_lb is null then null
    when c.contract_lb = y.target_lb then true else false
  end                                                      as contract_matches_sibling,

  /* ── provenance on every row ──────────────────────────────────────────────── */
  'conversion_factors.monthly_min_dried_flower_lb'::text   as contract_source,
  'v_yield_vs_target.dried_flower_lb (metrc_packages, category Buds, packaged directly off a harvest)'::text
                                                           as actual_source,
  'Dried flower is counted in the month it was PACKAGED, while harvests are counted in the month they FINISHED. '
  || 'Drying takes 10-14 days by the owner''s own rule, so a pull cut late in a month lands its pounds in the next. '
  || 'One month''s variance can be a timing artefact; judge a run of months. Fresh frozen is excluded from the '
  || 'contract because the rule says it does not count towards it.'::text
                                                           as how_this_is_counted
from months m
left join public.v_yield_vs_target y on y.month_date = m.month_date
left join contract c on true
order by m.month_date desc;

comment on view public.v_harvest_contract_vs_metrc is
'Contracted dried flower against what Metrc actually recorded, one row per month for the current month and the trailing twelve. READ-ONLY. actual_dried_lb is taken from v_yield_vs_target rather than re-derived, so there is one definition of dried pounds and not two. contract_lb is read from conversion_factors.monthly_min_dried_flower_lb - the contracted FLOOR, not monthly_target_dried_lb, which is a different promise that happens to hold the same number today. If that rule row is absent the view still returns every month with contract_lb NULL and evidence_status "missing", because the absence is the finding. Months with no harvest are generated rather than dropped and read NULL, never 0. NOTE: v_monthly_yield does not read the rule - it hardcodes 380 - so this view carries sibling_target_lb and contract_matches_sibling to make that second definition visible the day the two diverge.';
