-- Two checks were mis-calibrated in opposite directions. Both corrected 9 Aug 2026.
--
-- 1. packages-unique-on-tag READ GREEN ON A REAL FAULT.
--    4,252 distinct tags across 4,259 rows: SEVEN tags appear twice. Tolerance was 0.5%,
--    the difference is 0.16%, so the check reported "agree" while duplicates existed.
--    UNIQUENESS IS NOT A PERCENTAGE. A tag is unique or it is not, and a Metrc tag is the
--    identity of a physical package - two rows for one tag means any join through it can
--    double-count weight or money. Tolerance is now 0.
--    A check that reads green on a real difference is worse than no check, because it
--    actively certifies the broken thing as working (LESSONS.md, the false-green family).
update verification_checks
set tolerance_pct = 0,
    severity = 'critical',
    what_it_proves = 'A Metrc tag is the identity of a physical package. Two rows for one tag '
      'means any join through it can double-count weight, money or test state. UNIQUENESS IS '
      'NOT A PERCENTAGE - tolerance is 0 and any difference at all is a fault. Measured 9 Aug '
      '2026: 7 tags appear twice, and the previous 0.5% tolerance reported that as agreement.'
where check_key = 'packages-unique-on-tag';

-- 2. room-name-alone-is-not-a-room CANNOT PASS, and sat in the fault list looking like a
--    regression. It compares 15 real rooms against 13 distinct names, and it will disagree
--    for as long as the site reuses names across the two licences - which is a standing
--    fact of the buildings, not a defect anyone is going to fix this week.
--    A permanent red trains people to ignore the board, exactly as a noisy alert does. It is
--    the mirror of "a check that cannot fail proves nothing" (C0b): a check that cannot pass
--    proves nothing either, because its signal never changes.
--    Kept, because the fact is worth restating to every agent - but demoted to 'watch' and
--    retitled so it reads as a STANDING CONDITION rather than a new fault.
update verification_checks
set severity = 'watch',
    title = 'STANDING FACT: a room name alone does not identify a room',
    what_it_proves = 'EXPECTED TO DISAGREE, PERMANENTLY. This is not a regression and needs no '
      'investigation. It restates a fact of the buildings: room names are reused across both '
      'licences, so 15 real rooms wear 13 names and 557 of 862 held packages sit in a shared '
      'name. It returns to agreement only if the site stops reusing names. Its job is to keep '
      'the fact visible so no agent groups a total by bare room name and silently sums across '
      'two buildings (rule J7). The enforcement that actually binds is in brain/AGENT_DATA_RULES.md, '
      'held in all three AI runtimes by rules-in-sync.mjs.'
where check_key = 'room-name-alone-is-not-a-room';;
