/* STRAIN PERFORMANCE AND SCORING
   ------------------------------
   Owner 7 Aug 2026: each harvest goal is 180 lb; monitor what each strain
   yields, keep notes, score them, and build schedules around the highest
   yielders - limiting new strains, keeping some lower yielders for variety.

   The measured half comes from Metrc. The judged half - notes, a score, and
   the decision to favour, trial, keep for variety or retire - is a human call
   and stays editable, because a strain is not only its yield. A 60 g strain
   that sells out beats a 100 g strain nobody asks for.

   Measured on CLOSED, non-fresh-frozen harvests only. Open harvests have not
   packaged yet, and counting them would understate every recent strain. */

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status)
values ('harvest_goal_lb', 180, 'lb', 'Dried flower goal per harvest',
 'What a single pull is expected to deliver in finished dried flower.',
 'Owner 7 Aug 2026: "each harvest goal is 180lbs". Ties out: 26 pulls x 180 = 4,680 lb a year against a 4,560 lb contract, so the goal carries a small margin by design.',
 'owner', 'confirmed')
on conflict (key) do nothing;

create table if not exists strain_scorecard (
  strain            text primary key,
  status            text not null default 'unreviewed'
                    check (status in ('favoured','keep_for_variety','trial','retire','unreviewed')),
  manual_score      integer check (manual_score between 1 and 10),
  sells_well        text check (sells_well in ('strong','steady','slow','unknown')) default 'unknown',
  notes             text,
  max_plants_per_year integer,       -- a cap for variety strains
  decided_by        text,
  decided_on        date,
  updated_at        timestamptz not null default now()
);
alter table strain_scorecard enable row level security;
drop policy if exists ss_read on strain_scorecard;
create policy ss_read on strain_scorecard for select to authenticated using (true);
drop policy if exists ss_write on strain_scorecard;
create policy ss_write on strain_scorecard for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid()
                 and u.role = any (array['owner'::app_role,'executive'::app_role,'planner'::app_role,'dept_head'::app_role])))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid()
                 and u.role = any (array['owner'::app_role,'executive'::app_role,'planner'::app_role,'dept_head'::app_role])));
grant select on strain_scorecard to authenticated;
grant insert, update, delete on strain_scorecard to authenticated;

create or replace view v_strain_performance as
with h as (
  select coalesce(nullif(raw->>'SourceStrainNames',''),'(not recorded)') as strain,
         (raw->>'PlantCount')::int as plants,
         (raw->>'TotalPackagedWeight')::numeric/453.592 as packaged_lb,
         wet_weight/453.592 as wet_lb,
         harvest_start::date as cut
  from metrc_harvests
  where wet_weight > 0
    and (raw->>'FinishedDate') is not null
    and not (name ilike '%FF%' or coalesce(raw->>'DryingLocationName','') ilike '%freezer%')
),
m as (
  select strain, count(*) harvests, sum(plants) plants,
         round(sum(packaged_lb),1) packaged_lb,
         round(sum(packaged_lb)*453.592/nullif(sum(plants),0),1) grams_per_plant,
         round(100*sum(packaged_lb)/nullif(sum(wet_lb),0),1) conversion_pct,
         min(cut) first_grown, max(cut) last_grown
  from h where plants > 0 group by strain
)
select
  m.strain, m.harvests, m.plants, m.packaged_lb, m.grams_per_plant, m.conversion_pct,
  m.first_grown, m.last_grown,
  /* What one full pull of this strain would deliver, at each room size */
  round(m.grams_per_plant * 1140 / 453.592, 1) as lb_from_a_large_room,
  round(m.grams_per_plant * 1050 / 453.592, 1) as lb_from_a_small_room,
  round(m.grams_per_plant * 1140 / 453.592 - f_rule_at('harvest_goal_lb'), 1) as large_room_vs_goal,
  /* Confidence: a strain grown twice is a guess, grown fifteen times is a fact */
  case when m.harvests >= 8 then 'proven'
       when m.harvests >= 4 then 'indicative'
       else 'UNPROVEN — too few harvests to judge' end as confidence,
  /* Measured score out of 10, anchored on the yield needed to meet contract */
  greatest(1, least(10, round(m.grams_per_plant / (f_rule_at('grams_per_plant_for_contract')/5.0))::int)) as yield_score,
  (m.grams_per_plant >= f_rule_at('grams_per_plant_for_contract')) as meets_contract_yield,
  case when m.last_grown < current_date - 365 then 'not grown in over a year'
       when m.last_grown < current_date - 180 then 'not grown in six months'
       else 'in rotation' end as currency,
  coalesce(s.status,'unreviewed') as status,
  s.manual_score, s.sells_well, s.notes, s.max_plants_per_year,
  s.decided_by, s.decided_on,
  /* Ranking for schedule building: the judged score wins when someone has set
     one, because yield alone does not decide what to grow. */
  coalesce(s.manual_score,
           greatest(1, least(10, round(m.grams_per_plant / (f_rule_at('grams_per_plant_for_contract')/5.0))::int))) as ranking_score
from m
left join strain_scorecard s on s.strain = m.strain
where m.plants >= 100;

grant select on v_strain_performance to authenticated;

comment on view v_strain_performance is
  'Measured yield per strain from closed non-fresh-frozen harvests, joined to the human scorecard. Use ranking_score to build schedules.';
comment on table strain_scorecard is
  'The judged half: notes, score, whether it sells, and whether to favour, keep for variety, trial or retire. Editable by owner, executive, planner or dept head.';;
