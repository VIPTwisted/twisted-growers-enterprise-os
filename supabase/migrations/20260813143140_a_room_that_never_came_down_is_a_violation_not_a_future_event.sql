/* THE ROOM THAT NEVER CAME DOWN WAS STILL INVISIBLE, ONE VIEW LATER.
 *
 * Found by Agent B while building the page, not by anything that runs.
 *
 * v_schedule_adherence read:
 *
 *     when actual_date is null then 'NOT YET HAPPENED'
 *     is_violation = (event_type = 'Pull' and actual_date > scheduled_date)
 *
 * So F4 - 31 days past its pull date with no harvest at all - was filed as NOT YET
 * HAPPENED, beside a pull scheduled for December. days_late null. is_violation null,
 * because null > date is null, so it was not even false. The worst state in the
 * data was the one state the view could not express.
 *
 * This is the SAME defect I spent today fixing in v_schedule_compliance, surviving
 * one layer downstream. I rebuilt the source and did not check what read it. The
 * hard rule is late is never acceptable; a room standing 31 days past its date is
 * the most late a pull can possibly be, and it was rendering as neutral.
 *
 * NOW: a past-due pull with no takedown is a VIOLATION, its lateness counts from
 * today and grows daily, and it says the room is still standing. A pull whose date
 * has not arrived is still NOT YET HAPPENED, which is the only honest reading of it.
 *
 * ALSO NAMED, NOT FIXED HERE. v_schedule_cost_detail requires actual_date >
 * scheduled_date, so these same three pulls - 52 days and counting - appear in NO
 * cost figure anywhere. The year total excludes the worst of the year. That is a
 * data-layer decision about whether an unrealised pull has a cost yet, and it is
 * not one to make silently inside a migration about labels. Raised with the owner.
 */

create or replace view public.v_schedule_adherence as
select event_type,
       room,
       cultivars,
       scheduled_date,
       case when event_type = 'Pull' then actual_date end                    as observed_date,
       case
         when event_type <> 'Pull' then null::int
         when actual_date is not null then (actual_date - scheduled_date)::int
         /* Open-ended. Measured from today because the clock has not stopped. */
         when scheduled_date < current_date then (current_date - scheduled_date)::int
       end                                                                   as days_late,
       case
         when event_type <> 'Pull'
           then 'NOT MEASURED — this row''s actual date is computed as harvest_start plus the drying window, so it can never differ from plan. Drying adherence is unmeasured, not compliant. The real completion is in metrc_packages.packaged_on and nothing has been wired to it.'
         when actual_date is null and scheduled_date >= current_date
           then 'NOT YET HAPPENED'
         when actual_date is null
           then 'OVERDUE by ' || (current_date - scheduled_date)
                || ' days — VIOLATION, room ' || coalesce(flower_room, room)
                || ' is still standing and the count grows daily'
         when actual_date < scheduled_date
           then 'EARLY by ' || (scheduled_date - actual_date) || ' days — acceptable'
         when actual_date = scheduled_date
           then 'ON THE DAY'
         else 'LATE by ' || (actual_date - scheduled_date) || ' days — VIOLATION'
       end                                                                   as adherence,
       (event_type = 'Pull'
         and (actual_date > scheduled_date
              or (actual_date is null and scheduled_date < current_date)))   as is_violation,
       (event_type <> 'Pull')                                                as is_unmeasured,
       planned_lbs,
       planned_plants,
       /* --- appended 13 Aug 2026 --- */
       flower_room,
       (event_type = 'Pull' and actual_date is null and scheduled_date < current_date) as is_open_ended
  from public.v_schedule_compliance sc
 where scheduled_date is not null;

comment on view public.v_schedule_adherence is
  'Adherence verdicts on top of v_schedule_compliance. A past-due pull with no takedown is a VIOLATION whose lateness is measured from today and grows daily - it read NOT YET HAPPENED until 13 Aug 2026, which filed a room 31 days overdue beside a pull scheduled for December and left is_violation null rather than true. Use is_open_ended to separate the pulls whose clock has not stopped; their days_late is a floor, not a final figure. Dry rows remain NOT MEASURED.';;
