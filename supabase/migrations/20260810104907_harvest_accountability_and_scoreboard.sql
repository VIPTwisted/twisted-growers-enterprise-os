-- Every harvest, its flower room, its drying room, and WHO was accountable at each stage.
-- Where nobody has been assigned it says so plainly and never guesses a name (rule A3).

create or replace view v_harvest_accountability as
with h as (
  select a.*,
         coalesce('F' || substring(a.harvest from '(?i)-\s*\d{7,8}.*?f\s*[-]?\s*([1-4])'),
                  '(no room in the harvest name)')       as flower_room,
         a.room                                          as drying_room
  from v_harvest_yield_audit a
)
select
  h.harvest, h.strain, h.flower_room, h.drying_room, h.finished_on, h.plants,
  h.wet_in_lb, h.dry_yield_lb, h.dry_g_per_plant, h.water_pct,
  h.expected_dry_lb_at_target, h.vs_target_lb, h.vs_target_dollars,
  h.strain_median_dry_g, h.vs_own_strain_g,
  h.audit_verdict, h.concern,

  coalesce(g.full_name, 'NOBODY ASSIGNED')               as grower,
  coalesce(g.basis,     'no grow assignment covers this harvest') as grower_basis,
  coalesce(d.full_name, 'NOBODY ASSIGNED')               as dry_room_lead,
  coalesce(d.basis,     'no dry assignment covers this harvest')  as dry_lead_basis,

  -- who this verdict actually points at
  case
    when h.audit_verdict like 'YIELD SHORT, drying normal%'
      then coalesce(g.full_name,'NOBODY ASSIGNED') || ' (grow) — drying was normal, so this is the room or the plants'
    when h.audit_verdict like 'CHECK: more weight vanished%'
      then coalesce(d.full_name,'NOBODY ASSIGNED') || ' (dry room) and whoever weighed at takedown — water loss is above the band'
    when h.audit_verdict like 'CHECK: too little water%'
      then 'whoever weighed at takedown — the wet weight looks understated'
    when h.concern = 'none' then 'no action'
    else 'review with both'
  end                                                     as points_at,
  h.in_plain_english
from h
left join lateral f_harvest_accountable(h.harvest, h.flower_room, h.drying_room, h.finished_on, 'grow') g on true
left join lateral f_harvest_accountable(h.harvest, h.flower_room, h.drying_room, h.finished_on, 'dry')  d on true;

comment on view v_harvest_accountability is
  'Every closed dried harvest with its flower room, drying room and the person accountable at '
  'each stage. Says NOBODY ASSIGNED rather than guessing. points_at translates the audit '
  'verdict into which stage owns it: normal water with short yield is the grow; water above '
  'the band is the dry room or the takedown scale.';


-- THE SCOREBOARD. Per grower, per room - built to drill down to the individual harvests
-- behind every number (rule C1), because a scoreboard nobody can audit is just an opinion.
create or replace view v_cultivation_scoreboard as
select
  grower                                                   as person,
  'grow'::text                                             as stage,
  flower_room                                              as area,
  count(*)                                                 as harvests,
  sum(plants)                                              as plants,
  round(sum(dry_yield_lb)::numeric,1)                      as dry_yield_lb,
  round(avg(dry_g_per_plant)::numeric,1)                   as avg_g_per_plant,
  70.6                                                     as target_g_per_plant,
  round((avg(dry_g_per_plant) - 70.6)::numeric,1)          as vs_target_g,
  round(avg(vs_own_strain_g)::numeric,1)                   as vs_own_strain_g,
  round(sum(vs_target_lb)::numeric,1)                      as vs_target_lb,
  sum(vs_target_dollars)                                   as vs_target_dollars,
  round(avg(water_pct)::numeric,1)                         as avg_water_pct,
  count(*) filter (where concern <> 'none')                as harvests_of_concern,
  count(*) filter (where audit_verdict like 'CHECK%')      as harvests_flagged,
  min(finished_on)                                         as first_harvest,
  max(finished_on)                                         as last_harvest
from v_harvest_accountability
group by grower, flower_room

union all

select dry_room_lead, 'dry', drying_room,
  count(*), sum(plants), round(sum(dry_yield_lb)::numeric,1),
  round(avg(dry_g_per_plant)::numeric,1), 70.6,
  round((avg(dry_g_per_plant) - 70.6)::numeric,1),
  round(avg(vs_own_strain_g)::numeric,1),
  round(sum(vs_target_lb)::numeric,1), sum(vs_target_dollars),
  round(avg(water_pct)::numeric,1),
  count(*) filter (where concern <> 'none'),
  count(*) filter (where audit_verdict like 'CHECK%'),
  min(finished_on), max(finished_on)
from v_harvest_accountability
group by dry_room_lead, drying_room;

comment on view v_cultivation_scoreboard is
  'Per person and area: harvests, plants, dry yield, grams per plant against the 70.6 target '
  'AND against each strain''s own median, water percentage, and how many harvests are flagged. '
  'Every row drills to the individual harvests in v_harvest_accountability. Rank people on '
  'vs_own_strain_g, not the flat target - a flat target is unfair to a low-yielding cultivar '
  'and lets a high-yielding one hide.';;
