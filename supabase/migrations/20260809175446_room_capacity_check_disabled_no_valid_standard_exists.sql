-- DISABLED, because it cannot fail and no correct version can be written today.
-- Green and marked critical is the worst state for a check that proves nothing (C0b).
--
-- AGENT D SUPPLIED THE PROOF; I VERIFIED IT INDEPENDENTLY. Per room the largest
-- room-period pull EXACTLY equals recorded capacity — 1140/1140, 1050/1050,
-- 1140/1140, 1050/1050, across 11 to 15 periods each. Capacity was populated FROM
-- the maximum observed pull, and a maximum cannot be exceeded by its own series.
--
-- TWO ERRORS OF MINE, RECORDED BECAUSE THEY ARE THE USEFUL PART.
-- 1. I "disproved" this by grouping harvests by NAME instead of by room-period,
--    got 643/420/380/335, and confidently reported the register's suspicion as
--    false. A pull is the room emptied in a cycle. Wrong unit, wrong conclusion.
-- 2. My replacement had the SAME defect, and my proof that it "can fail" — 46
--    breaches at 55% of capacity — tested the SQL against a hypothetical
--    standard. That shows the query is capable of returning non-zero. It says
--    nothing about whether the check can fail against the REAL standard.
--
-- THE CONSEQUENCE IS BIGGER THAN THE CHECK. If recorded capacities are observed
-- maxima, conversion_factors holds NO measured capacity at all. CONTRADICTIONS
-- #11 (1,150 in CLAUDE.md vs 1,140/1,050 in config) must NOT be settled by
-- picking a side — neither is a measurement. It needs a physical count.
update verification_checks
set enabled = false,
    severity = 'blocked',
    what_it_proves =
      'DISABLED 9 Aug 2026 — THIS CHECK CANNOT FAIL. Capacity was populated from the maximum '
      || 'observed pull: per room the largest room-period pull equals recorded capacity to the '
      || 'plant (1140/1140, 1050/1050, 1140/1140, 1050/1050 over 11-15 periods). 14 green runs '
      || 'proved nothing while reading critical. RE-ENABLE ONLY when conversion_factors carries a '
      || 'capacity from a PHYSICAL COUNT of tables and plant spacing, not from harvest history. '
      || 'Proof by Agent D, verified independently by Agent B, who had previously reported the '
      || 'opposite by grouping harvests by name instead of by room-period.'
where check_key = 'room-capacity-never-exceeded';

insert into open_questions (question_key, area, question, why_it_matters, what_is_blocked, first_seen, last_seen, status)
select
  'room-capacity-physical-count',
  'Cultivation',
  'What is the REAL plant capacity of rooms F1-F4 — from a physical count of tables and plant spacing, not from harvest history?',
  'conversion_factors currently holds the maximum observed pull as "capacity", so every capacity, '
  || 'utilisation and per-room-day figure is measured against what we happened to do rather than '
  || 'what the room actually holds. Only a physical count answers it.',
  'room-capacity-never-exceeded is disabled and unfailable until this exists. CONTRADICTIONS #11 '
  || '(1,150 vs 1,140/1,050) cannot be settled by choosing between them — neither number is a '
  || 'measurement. Minimum-plants-per-room and room-at-capacity rules rest on the same figure.',
  now(), now(), 'open'
where not exists (select 1 from open_questions where question_key = 'room-capacity-physical-count');;
