-- Agent I, 13 Aug 2026. DBI-107.
--
-- OWNER HARD RULE, verbatim: "LATE DRYING IS EXTREMELY BAD. I PROVIDED EXPECTED HARVEST TURNOVER
-- SPREADSHEET WE TAKE DOWN REROOM AND CLEAN, CONVERT ROOM IN 1-2 DAYS TOPS. HARD RULE; HARVEST
-- CAN BE TAKEN DOWN FEW DAYS EARLY BUT NOT LATE. EVERYTHING MUST STRICLY FOLLOW THIS".
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AND A FALSE FINDING I ALMOST HANDED HIM, CAUGHT BY THE UNIFORMITY OF THE NUMBER.
--
-- I reported "23 dry events, every one 14 days late". Every one EXACTLY 14, zero variance. That
-- is not what 23 independent operational slips look like, and the shape is what made me check.
--
-- The Dry branch of v_schedule_compliance is:
--     scheduled_date = m.harvest_start
--     actual_date    = m.harvest_start + (select threshold from harvest_alert_rules
--                                          where rule_key = 'dry_max_days')   -- 14
-- `actual_date` HOLDS A COMPUTED TARGET, NOT AN ACTUAL DATE. The difference is therefore 14 on
-- every row by construction: it is the drying window itself, relabelled as lateness.
--
-- SO DRYING COMPLIANCE IS NOT BEING MEASURED AT ALL. Not "measured and failing" - unmeasured.
-- There are ZERO recorded dry-completion dates in that view, and a column named actual_date that
-- contains no actual. Under the owner's rule that late drying is extremely bad, the platform
-- currently cannot tell him whether a single dry ran late. That is worse than a bad number: a bad
-- number gets argued with, a fabricated one gets believed.
--
-- The real completion date IS available - metrc_packages.packaged_on is when dried material was
-- first packaged out of a harvest, and v_harvest_forensic already computes
-- dry_days_to_first_package from it. Nothing wired it to compliance.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE RULE IS ASYMMETRIC AND THAT IS THE POINT. Most schedule checks measure absolute variance
-- and treat 3 days early the same as 3 days late. His rule does not: early is acceptable, late is
-- a violation. A view that reports "3 days off schedule" for both hides exactly the distinction
-- he cares about.
--
-- MEASURED TODAY on pulls, which ARE genuinely recorded:
--     5 early (acceptable) - 3 on the day - 7 LATE, worst 11 days, average 6.1
-- Seven real violations, and they were sitting behind a count of 8 that mixed them with drying
-- artefacts.
--
-- ROOM TURNOVER: 1-2 days is his stated maximum, recorded here as the standard to measure
-- against. NOT yet measured - down-to-replant needs the replant date, which harvest_pulls carries
-- as day2_replant_date on 26 rows. Filed, not asserted.
--
-- NO FIGURE IS RESTATED HERE. v_schedule_compliance is left alone; correcting it means changing
-- what a published tile counts, and that is a separate, reviewed change. This adds the rule and
-- an honest view beside it that says plainly which events are measured and which are not.
--
-- UNDO: drop view v_schedule_adherence; delete the two conversion_factors rows.

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status)
values
('harvest_early_is_fine_late_is_never','1','rule',
 'A harvest may come down a few days EARLY. It may never come down LATE.',

 'The rule is deliberately asymmetric and every measure must honour it. Early is acceptable and '
 'needs no explanation. LATE IS A VIOLATION and needs a reason, an owner and a corrective action. '
 'Any view reporting "days off schedule" as an absolute number is WRONG for this business, '
 'because it hides the only distinction that matters. This applies to the pull and to the dry '
 'equally — the owner''s words were "EVERYTHING MUST STRICLY FOLLOW THIS". '
 'WHY LATE COSTS MORE THAN IT LOOKS: a late take-down holds the room, and the room is the '
 'constraint. Every day late is a day the next cycle does not start, so lateness compounds down '
 'the calendar while earliness does not.',

 'Owner hard rule 13 Aug 2026, verbatim: "HARD RULE; HARVEST CAN BE TAKEN DOWN FEW DAYS EARLY BUT '
 'NOT LATE. EVERYTHING MUST STRICLY FOLLOW THIS" and "LATE DRYING IS EXTREMELY BAD".',
 'Owner (Vinny)','owner_set'),

('room_turnover_max_days','2','days',
 'Down, re-roomed, cleaned and converted — 1 to 2 days at most',

 'From take-down to the room being ready for the next cycle. The owner''s stated maximum is 1-2 '
 'days: "WE TAKE DOWN REROOM AND CLEAN, CONVERT ROOM IN 1-2 DAYS TOPS". A room sitting idle '
 'beyond that is lost cycle time on the constraint, and it does not appear in any yield figure — '
 'which is why it has to be measured separately. '
 'NOT YET MEASURED. Down-to-replant needs the replant date; harvest_pulls carries '
 'day2_replant_date on 26 rows and nothing compares it to the take-down. Filed as work, not '
 'presented as a figure.',

 'Owner hard rule 13 Aug 2026, from the harvest turnover spreadsheet he provided.',
 'Owner (Vinny)','owner_set')
on conflict (key) do update set
  label = excluded.label, what_it_means = excluded.what_it_means,
  where_it_came_from = excluded.where_it_came_from, evidence_status = excluded.evidence_status,
  updated_at = now();

create or replace view public.v_schedule_adherence as
select sc.event_type, sc.room, sc.cultivars, sc.scheduled_date,
       -- Only a PULL carries a real observed date. The Dry branch computes
       -- harvest_start + dry_max_days, so its "actual" is a target and is nulled here rather
       -- than compared: comparing a target to its own basis manufactures a 14-day slip.
       case when sc.event_type = 'Pull' then sc.actual_date end        as observed_date,
       case when sc.event_type = 'Pull' and sc.actual_date is not null
            then sc.actual_date - sc.scheduled_date end                as days_late,
       case
         when sc.event_type <> 'Pull'
           then 'NOT MEASURED — this row''s actual date is computed as harvest_start plus the '
                'drying window, so it can never differ from plan. Drying adherence is unmeasured, '
                'not compliant. The real completion is in metrc_packages.packaged_on and nothing '
                'has been wired to it.'
         when sc.actual_date is null            then 'NOT YET HAPPENED'
         when sc.actual_date < sc.scheduled_date
           then 'EARLY by ' || (sc.scheduled_date - sc.actual_date) || ' days — acceptable'
         when sc.actual_date = sc.scheduled_date then 'ON THE DAY'
         else 'LATE by ' || (sc.actual_date - sc.scheduled_date) || ' days — VIOLATION'
       end                                                             as adherence,
       (sc.event_type = 'Pull' and sc.actual_date > sc.scheduled_date) as is_violation,
       (sc.event_type <> 'Pull')                                       as is_unmeasured,
       sc.planned_lbs, sc.planned_plants
from v_schedule_compliance sc
where sc.scheduled_date is not null;

comment on view public.v_schedule_adherence is
 'Schedule adherence under the owner''s hard rule of 13 Aug 2026: a harvest may come down a few '
 'days EARLY but never LATE. Asymmetric on purpose — an absolute "days off schedule" figure hides '
 'the only distinction that matters. It also refuses to score drying, because '
 'v_schedule_compliance computes the Dry actual_date as harvest_start + dry_max_days: the '
 'difference is 14 on every row BY CONSTRUCTION, which is the drying window wearing the word '
 '"late". That artefact was reported to the owner as 23 late dry events and withdrawn; the '
 'uniformity of the number is what exposed it. Drying is UNMEASURED, and this view says so rather '
 'than scoring it.';;
