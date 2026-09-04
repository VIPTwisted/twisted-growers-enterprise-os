-- Applied prod 20260904220445. Room from metrc_harvests.flower_room, not harvest_name ILIKE.
-- E1 column order held. 56-day rule NOT changed.
create or replace view public.v_room_turn_audit as
with src as (
         select g.code            as room,
                g.plant_capacity,
                f.harvest_started,
                f.strain,
                f.plants,
                f.wet_lb
           from v_harvest_forensic f
           join metrc_harvests h
             on h.name = f.harvest_name
           join grow_rooms g
             on g.code = h.flower_room
          where g.active
            and f.harvest_started is not null
            and f.drying_room <> 'Freezer/Biomass Storage'
            and h.flower_room is not null
     ),
     day as (
         select distinct room, harvest_started from src
     ),
     marked as (
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
'Room turn at PULL grain. Room from metrc_harvests.flower_room, not harvest_name ILIKE. Freezer/Biomass excluded. Consecutive calendar days = one pull. cycle_days is harvest-to-harvest. f_rule(room_cycle_days)=56 is the flowering target — do not read LATE as staff failure until the owner names whether 56 is flower or harvest-to-harvest. Modal harvest-to-harvest is 70. E1 column order held.';
