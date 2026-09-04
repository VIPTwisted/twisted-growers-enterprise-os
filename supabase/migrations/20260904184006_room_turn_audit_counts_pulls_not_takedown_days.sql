/* THE ROOM TURN AUDIT WAS COUNTING TAKEDOWN DAYS, NOT PULLS.
 *
 * A room is emptied over one or two days - room_turnover_max_days is 2 and the crew
 * works a takedown across a Monday and a Tuesday. Metrc records that as two harvests
 * with two different Harvest Start Dates. The old view grouped on the date, so one
 * physical pull became two rows, and the second row carried a "room turn" of 1 day
 * against a 56 day target and was published as a 55-day-EARLY FAILURE.
 *
 * F1, 15 and 16 July 2024, is the plain example: 773 plants down on the Monday and
 * 341 on the Tuesday, one pull, printed as two, the second one a fabricated failure.
 *
 * WHAT THIS CHANGES
 *
 *   The grain is now the PULL. Harvest start dates in the same room on consecutive
 *   calendar days are one pull. pull_start is the first day of the takedown, pull_end
 *   the last, takedown_days the span - and that span is itself worth watching, because
 *   room_turnover_max_days says the crew has 2 days to take down, re-room and clean.
 *
 *   cycle_days is measured start-of-pull to start-of-pull. Not end to start: the room
 *   comes round on when it was emptied, and using pull_end would silently shorten every
 *   cycle that ran over two days.
 *
 *   room_turn_days is KEPT and carries the same number as cycle_days, so nothing that
 *   already reads this view breaks. harvest_started and harvest_started_date are KEPT
 *   and now carry pull_start.
 *
 * E1 COLUMN ORDER (4 Sep 2026)
 *
 *   CREATE OR REPLACE cannot rename a live column. The live view's first 11 columns
 *   stay in this exact order: room, plant_capacity, harvest_started, cultivars,
 *   plants, wet_lb, prev, room_turn_days, required_days, verdict, harvest_started_date.
 *   Six new columns append after harvest_started_date: pull_id, pull_start, pull_end,
 *   takedown_days, cycle_days, exception_reason. Numbers do not change.
 *
 * THE EXCEPTION RULE, AND WHY IT IS NOT A PASS AND NOT A FAIL
 *
 *   Four gaps in the record are under 20 days - three in F2 and one in F4, all in the
 *   first months of the ledger. A room physically cannot turn in a fortnight, so these
 *   are not turns. They are a partial pull, a straggler cut, or a takedown that ran
 *   across a weekend and broke the consecutive-day chain. Calling them "43 days EARLY"
 *   was arithmetic on a thing that never happened. They are now EXCEPTION, they carry
 *   an exception_reason, and they are excluded from the PASS/FAIL population entirely.
 *
 * THE NUMBER 56 IS STILL NOT WRITTEN DOWN HERE. Every threshold in the verdict prose is
 * derived from f_rule('room_cycle_days'), per the standing instruction of 17 Aug 2026.
 * The <20 day exception floor is the one literal, and it is a floor on physical
 * possibility rather than a policy target, so it does not belong in the rules table.
 *
 * MEASURED ON THE LIVE MIRROR, 4 Sep 2026, F1-F4, Freezer/Biomass excluded:
 *
 *     90 harvest start dates  ->  52 pulls
 *     48 gaps:  43 LATE, 1 PASS (F2, 57 days), 0 EARLY, 4 EXCEPTION
 *     4 FIRST rows, one per room
 *     35 of the 52 pulls ran over more than one day - the defect was the norm, not an edge
 *     F1 2024-07-15 + 2024-07-16 -> ONE pull, takedown_days 2
 *
 *     per room:  F1 12 pulls / 11 late   F2 15 pulls / 10 late / 1 pass / 3 exception
 *                F3 12 pulls / 11 late   F4 13 pulls / 11 late / 1 exception
 *
 * DISCREPANCY, RAISED NOT BURIED. The work order expected 46 pulls. The measurement is
 * 52 and it is reproducible from the numbers above: 90 start dates, 38 of them absorbed
 * into a preceding day, leaves 52. 46 is not reachable from this population under any
 * consecutive-day rule; it is short by the six pulls taken since 8 Jun 2026 (F1 06-29,
 * F1 08-31, F2 07-13, F3 07-27, F4 06-08, F4 08-10), which reads like a figure measured
 * before those landed. The 43 LATE and the F1 July collapse both reproduce exactly.
 *
 * CREATE OR REPLACE. The view is not dropped, so its grants and its dependents survive.
 */

create or replace view public.v_room_turn_audit as
with src as (
         select g.code            as room,
                g.plant_capacity,
                f.harvest_started,
                f.strain,
                f.plants,
                f.wet_lb
           from v_harvest_forensic f
           join grow_rooms g
             on f.harvest_name ilike '%' || g.code
          where g.active
            and f.harvest_started is not null
            and f.drying_room <> 'Freezer/Biomass Storage'
     ),
     day as (
         select distinct room, harvest_started from src
     ),
     marked as (
         /* a start date that is exactly one day after the previous one in this room is
          * the same takedown carrying on, not a new pull */
         select room,
                harvest_started,
                case
                    when harvest_started
                         - lag(harvest_started) over (partition by room order by harvest_started) = 1
                    then 0 else 1
                end as is_new_pull
           from day
     ),
     grouped as (
         select room,
                harvest_started,
                sum(is_new_pull) over (partition by room
                                       order by harvest_started
                                       rows unbounded preceding) as pull_seq
           from marked
     ),
     pull as (
         select s.room,
                max(s.plant_capacity)                                     as plant_capacity,
                gr.pull_seq,
                min(s.harvest_started)                                    as pull_start,
                max(s.harvest_started)                                    as pull_end,
                (max(s.harvest_started) - min(s.harvest_started)) + 1     as takedown_days,
                count(distinct s.strain)                                  as cultivars,
                sum(s.plants)                                             as plants,
                round(sum(s.wet_lb), 1)                                   as wet_lb
           from src s
           join grouped gr
             on gr.room = s.room
            and gr.harvest_started = s.harvest_started
          group by s.room, gr.pull_seq
     ),
     seq as (
         select p.*,
                lag(p.pull_start) over (partition by p.room order by p.pull_start) as prev
           from pull p
     ),
     fin as (
         select seq.*,
                seq.pull_start - seq.prev as cycle_days
           from seq
     )
select f.room,
       f.plant_capacity,
       f.pull_start                                            as harvest_started,
       f.cultivars,
       f.plants,
       f.wet_lb,
       f.prev,
       f.cycle_days                                            as room_turn_days,
       f_rule('room_cycle_days')                               as required_days,
       case
           when f.prev is null
               then 'FIRST — nothing before it in this room'
           when f.cycle_days < 20
               then 'EXCEPTION — ' || f.cycle_days
                    || ' days after the previous pull. A room cannot turn that fast, so this is a partial '
                    || 'pull or a straggler takedown, not a room turn. Not judged against the cycle.'
           when abs(f.cycle_days::numeric - f_rule('room_cycle_days')) <= 2
               then 'PASS — ' || f.cycle_days || ' days, inside the '
                    || f_rule('room_cycle_days') || ' day cycle allowing the Sunday/Monday stagger'
           when f.cycle_days::numeric > f_rule('room_cycle_days')
               then 'FAIL — ' || f.cycle_days || ' days, '
                    || (f.cycle_days::numeric - f_rule('room_cycle_days'))
                    || ' days LATE. The room sat idle and pushed the next cycle.'
           else 'FAIL — ' || f.cycle_days || ' days, '
                || (f_rule('room_cycle_days') - f.cycle_days::numeric) || ' days EARLY.'
       end                                                     as verdict,
       f.pull_start                                            as harvest_started_date,
       f.room || '-' || to_char(f.pull_start, 'YYYYMMDD')      as pull_id,
       f.pull_start,
       f.pull_end,
       f.takedown_days,
       f.cycle_days,
       case
           when f.prev is not null and f.cycle_days < 20
               then 'Only ' || f.cycle_days || ' days after the previous pull in this room. Read as a '
                    || 'partial pull or a straggler takedown that broke the consecutive-day chain. '
                    || 'Excluded from the cycle PASS/FAIL population.'
       end                                                     as exception_reason
  from fin f
 order by f.room, f.pull_start;

alter view public.v_room_turn_audit set (security_invoker = true);

comment on view public.v_room_turn_audit is
'Room turn audit at PULL grain, F1-F4 only, Freezer/Biomass excluded. Harvest start dates '
'in the same room on consecutive calendar days are ONE pull (the crew takes a room down over '
'one or two days and Metrc records each day separately). cycle_days is pull_start to previous '
'pull_start, judged against f_rule(''room_cycle_days'') with a +/-2 day tolerance. A gap under '
'20 days is an EXCEPTION - physically not a room turn - and is neither PASS nor FAIL. '
'room_turn_days, harvest_started and harvest_started_date are retained and carry cycle_days and '
'pull_start respectively so existing readers keep working. Live column order is preserved '
'(E1): eleven existing columns first, six new columns appended.';
