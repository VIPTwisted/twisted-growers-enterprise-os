/* A NOTE THAT TELLS THE NEXT READER TO BLIND THE CHECK.
 *
 * ordinal_match_max_divergence_days is the bound past which a planned pull and the
 * takedown matched to it are too far apart to be late work - beyond it, the ordinal
 * has slipped and the pairing is wrong. Threshold 45, severity critical.
 *
 * Its note said: "the shortest gap between two takedowns of one room is 59 days, so
 * nothing legitimate lands between. Raising this above 59 would blind the check."
 *
 * Agent W measured the actual band and it is [26, 55]. I re-derived it rather than
 * take the report: F2's pulls run 23 Feb, 20 Apr, 15 Jun, 10 Aug, and its 29 Dec 2025
 * takedown is the one that claims F2's first ordinal slot if the floor ever reaches
 * back far enough. Pull 4 to 29 Dec 2025 is 56 days. So the ordinal slip this check
 * exists to catch PRESENTS AT 56, not 59 - and anyone who followed the note to 56,
 * 57, 58 or 59 would have set the bound exactly past the failure.
 *
 * The 59 was not invented; it is the shortest observed gap between two consecutive
 * takedowns of one room. But that is a different quantity from the divergence a
 * slipped ordinal produces, and I wrote the note treating them as the same. It is
 * the same class of error as measuring a cycle one way and a plan another.
 *
 * The threshold is unchanged at 45. It was always inside the safe band. The defect
 * was entirely in the instruction I left beside it - which is worse than a wrong
 * number, because a wrong number gets measured and a confident note gets followed.
 *
 * NOT A RATCHET CHANGE. No baseline moves, no guard relaxes, nothing is permitted
 * that was not permitted before. This narrows the range a future reader will believe
 * is safe.
 */

update public.harvest_alert_rules
   set note = 'The nth planned pull of a room is matched to the nth takedown of that room. Beyond this many days apart the pairing is not late work - it is the ordinal having slipped. MEASURED 13 Aug 2026, and the two numbers below are DIFFERENT QUANTITIES that an earlier version of this note conflated. Largest real divergence across the 13 matched pulls: 26 days. Divergence produced BY a slipped ordinal: 56 days - F2 pull 4 (23 Feb) against F2''s 29 Dec 2025 takedown, which is the takedown that claims F2''s first slot if the plan-match floor ever reaches back that far. The safe band is therefore [26, 55]. Do NOT raise this to 56-59: the earlier note cited 59 as the ceiling because that is the shortest gap between two consecutive takedowns of one room, which is not the same quantity, and following it would have set the bound exactly past the failure this check exists to catch. 45 sits inside the band with 19 days of clearance below and 10 above.'
 where rule_key = 'ordinal_match_max_divergence_days';;
