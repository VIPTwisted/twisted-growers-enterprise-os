-- OWNER RULING, 9 Aug 2026: the receipt window is 3 DAYS.
--
-- Asked how long before an unconfirmed shipment stops being in transit and becomes a custody
-- problem. I recommended 7; the owner set 3. Recorded because it is a business fact, not a
-- derived one -- inferring it from late rows would have made lateness the definition of normal
-- (rule A5).
--
-- MEASURED CONSEQUENCE, stated before baking it in rather than after:
--     7 days  -> 11 manifests, 47 packages overdue
--     3 days  -> 20 manifests, 150 packages overdue   (oldest 2025-05-05)
-- The stricter window nearly triples the chase list. That is the owner's call and it is
-- defensible; it is recorded here so nobody later reads 20 as a data problem.
update verification_checks
   set settles_within  = interval '3 days',
       in_flight_rule  = 'OWNER-SET 9 Aug 2026: 3 days. A transfer whose ship date is within '
         || '3 days is IN TRANSIT and must be excluded, not counted as unreceived. Beyond 3 '
         || 'days it is a custody question. Measured at the time of ruling: 20 manifests and '
         || '150 packages fall outside the window, 5 manifests and 51 packages inside it. '
         || 'Do NOT widen this window to reduce a red count -- that is how lateness becomes '
         || 'normal. Narrowing it is the owner''s call alone.'
 where check_key in ('packages-shipped-vs-received',
                     'packages-unique-on-tag',
                     'lab-samples-shipped-vs-held');

-- The window is now DECLARED. Consuming it in each check's SQL belongs to the lane that owns
-- the check -- packages-shipped-vs-received was claimed by another agent this session, and two
-- agents editing one check is how the same rule ends up implemented twice and differently.
-- Recorded so the declaration cannot be mistaken for the implementation: that distinction is
-- the meta-trap in _charter_common.md, "a decision recorded is not a decision implemented".
comment on column verification_checks.settles_within is
'How long the process normally takes to complete. Rows younger than this are IN FLIGHT, not late. OWNER-SET -- never inferred from the data, because inferring it from late rows makes lateness normal (rule A5). Set to 3 days by the owner on 9 Aug 2026 against a recommendation of 7. A check carrying this value MUST exclude rows younger than it, or the value is decoration.';

select check_key, severity, tolerance_pct, settles_within::text, measures_a_process
from verification_checks where measures_a_process order by check_key;;
