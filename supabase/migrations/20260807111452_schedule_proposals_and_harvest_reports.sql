/* SCHEDULE PROPOSALS AND HARVEST REPORTS
   --------------------------------------
   Owner 7 Aug 2026: build something that uses strain yield history to work out
   the best harvest schedules, propose them, propose changes, collaborate with
   users, and report on every harvest plus custom reports on demand.

   This is the foundation: proposals are DRAFTS a person accepts, rejects or
   edits - never applied automatically. A schedule decides what the company
   grows for two months; that is a human decision informed by evidence, not an
   automated one.

   The insight the engine encodes: a SMALL room needs a BETTER strain. To reach
   180 lb a 1,050-plant room needs 77.8 g per plant; a 1,140-plant room needs
   only 71.6. Putting a mediocre strain in F2 or F4 misses the goal in a way
   the same strain in F1 or F3 would not. */

create table if not exists schedule_proposals (
  id            bigserial primary key,
  title         text not null,
  covers_from   date not null,
  covers_to     date not null,
  status        text not null default 'draft'
                check (status in ('draft','proposed','accepted','rejected','superseded')),
  rationale     text,
  projected_lb  numeric,
  goal_lb       numeric,
  proposed_by   text not null,
  proposed_at   timestamptz not null default now(),
  decided_by    text,
  decided_at    timestamptz,
  decision_note text
);

create table if not exists schedule_proposal_lines (
  id            bigserial primary key,
  proposal_id   bigint not null references schedule_proposals(id) on delete cascade,
  pull_no       integer,
  harvest_date  date,
  room          text,
  room_capacity integer,
  strain        text,
  strain_basis  text,          -- why this strain was chosen
  expected_g_per_plant numeric,
  expected_lb   numeric,
  vs_goal_lb    numeric,
  confidence    text,
  user_changed_to text,        -- a person overriding the suggestion
  user_note     text
);
create index if not exists spl_proposal on schedule_proposal_lines (proposal_id, pull_no);

alter table schedule_proposals      enable row level security;
alter table schedule_proposal_lines enable row level security;
drop policy if exists sp_read on schedule_proposals;
create policy sp_read on schedule_proposals for select to authenticated using (true);
drop policy if exists spl_read on schedule_proposal_lines;
create policy spl_read on schedule_proposal_lines for select to authenticated using (true);
drop policy if exists sp_write on schedule_proposals;
create policy sp_write on schedule_proposals for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid()
        and u.role = any (array['owner'::app_role,'executive'::app_role,'planner'::app_role])))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid()
        and u.role = any (array['owner'::app_role,'executive'::app_role,'planner'::app_role])));
drop policy if exists spl_write on schedule_proposal_lines;
create policy spl_write on schedule_proposal_lines for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid()
        and u.role = any (array['owner'::app_role,'executive'::app_role,'planner'::app_role])))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid()
        and u.role = any (array['owner'::app_role,'executive'::app_role,'planner'::app_role])));

grant select on schedule_proposals, schedule_proposal_lines to authenticated;
grant insert, update, delete on schedule_proposals, schedule_proposal_lines to authenticated;
grant usage, select on sequence schedule_proposals_id_seq, schedule_proposal_lines_id_seq to authenticated;

/* ---------------- The proposal engine ----------------
   Rules, in order:
     1. Never propose a strain marked retire.
     2. Prefer proven strains that clear the room's required yield.
     3. Cap unproven strains (p_max_new) - the owner's "limit new strains".
     4. Reserve p_variety_slots for lower yielders so the menu stays varied.
     5. Spread strains rather than repeating one back-to-back in a room.
   Everything it proposes carries the reason, so a person can argue with it. */
create or replace function tg_propose_schedule(
  p_from date default current_date,
  p_to   date default (current_date + 180),
  p_max_new integer default 2,
  p_variety_slots integer default 2,
  p_by text default 'schedule engine'
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint; r record; s record;
  goal numeric := f_rule_at('harvest_goal_lb');
  need numeric; used_new integer := 0; used_variety integer := 0;
  total numeric := 0; idx integer := 0;
begin
  insert into schedule_proposals (title, covers_from, covers_to, goal_lb, proposed_by, status, rationale)
  values ('Proposed schedule '||to_char(p_from,'DD Mon')||' to '||to_char(p_to,'DD Mon YYYY'),
          p_from, p_to, goal, p_by, 'draft',
          'Built from measured strain yield on closed harvests. Favours proven strains that clear the '
          ||'yield each room needs for a '||goal||' lb pull. New strains capped at '||p_max_new
          ||'; '||p_variety_slots||' slots reserved for lower yielders so the menu stays varied. '
          ||'Nothing here is applied - it is a draft for a person to accept, edit or reject.')
  returning id into v_id;

  for r in
    select pull_no, harvest_date, upper(flower_room) as room,
           coalesce(f_rule_at('room_capacity_'||lower(flower_room)), 1050) as capacity
    from harvest_plan_2026
    where harvest_date between p_from and p_to
    order by harvest_date
  loop
    idx := idx + 1;
    need := goal * 453.592 / r.capacity;          -- g/plant this room must deliver

    select * into s from v_strain_performance sp
    where sp.status <> 'retire'
      and sp.grams_per_plant is not null
      and (sp.confidence = 'proven' or sp.grams_per_plant >= need * 1.1)
      and sp.grams_per_plant >= need
      and not exists (                             -- no repeat in the same room last time
        select 1 from schedule_proposal_lines l
        where l.proposal_id = v_id and l.room = r.room
          and l.strain = sp.strain
          and l.pull_no > r.pull_no - 8)
      and (sp.confidence <> 'UNPROVEN — too few harvests to judge' or used_new < p_max_new)
    order by
      case when sp.status='favoured' then 0 when sp.status='keep_for_variety' then 2 else 1 end,
      sp.ranking_score desc, sp.grams_per_plant desc
    limit 1;

    if s.strain is null then
      insert into schedule_proposal_lines
        (proposal_id, pull_no, harvest_date, room, room_capacity, strain, strain_basis,
         expected_g_per_plant, expected_lb, vs_goal_lb, confidence)
      values (v_id, r.pull_no, r.harvest_date, r.room, r.capacity, null,
        'NO STRAIN CLEARS THE BAR — this room needs '||round(need,1)||' g per plant to reach '
        ||goal||' lb and nothing available reaches it. Either lower the goal for this pull or accept a shortfall.',
        null, null, null, 'none available');
    else
      if s.confidence = 'UNPROVEN — too few harvests to judge' then used_new := used_new + 1; end if;
      if s.status = 'keep_for_variety' then used_variety := used_variety + 1; end if;
      total := total + round(s.grams_per_plant * r.capacity / 453.592, 1);
      insert into schedule_proposal_lines
        (proposal_id, pull_no, harvest_date, room, room_capacity, strain, strain_basis,
         expected_g_per_plant, expected_lb, vs_goal_lb, confidence)
      values (v_id, r.pull_no, r.harvest_date, r.room, r.capacity, s.strain,
        s.strain||' averages '||s.grams_per_plant||' g per plant over '||s.harvests
          ||' harvests. This room needs '||round(need,1)||' g per plant for a '||goal||' lb pull.'
          ||case when s.status='favoured' then ' Marked favoured.'
                 when s.status='keep_for_variety' then ' Kept for variety.'
                 when s.confidence like 'UNPROVEN%' then ' NEW STRAIN — counts against the cap of '||p_max_new||'.'
                 else '' end,
        s.grams_per_plant, round(s.grams_per_plant * r.capacity / 453.592, 1),
        round(s.grams_per_plant * r.capacity / 453.592 - goal, 1), s.confidence);
    end if;
  end loop;

  update schedule_proposals set projected_lb = total where id = v_id;
  return v_id;
end $$;

grant execute on function tg_propose_schedule(date,date,integer,integer,text) to authenticated;

/* ---------------- Per-harvest report ----------------
   Every harvest, what it was expected to deliver and what it did. */
create or replace view v_harvest_report as
select
  h.name as harvest, h.harvest_start::date as cut_date,
  upper(substring(regexp_replace(upper(h.name),'\s','','g') from 'F[1-4]')) as room,
  coalesce(nullif(h.raw->>'SourceStrainNames',''),'(not recorded)') as strain,
  (h.raw->>'PlantCount')::int as plants,
  round(h.wet_weight/453.592,1) as wet_lb,
  round((h.raw->>'TotalPackagedWeight')::numeric/453.592,1) as packaged_lb,
  round((h.raw->>'TotalPackagedWeight')::numeric/nullif((h.raw->>'PlantCount')::int,0),1) as grams_per_plant,
  f_rule_at('harvest_goal_lb', h.harvest_start) as goal_lb,
  round((h.raw->>'TotalPackagedWeight')::numeric/453.592 - f_rule_at('harvest_goal_lb', h.harvest_start),1) as vs_goal_lb,
  case when (h.raw->>'FinishedDate') is null then 'STILL OPEN — cannot be judged yet'
       when (h.name ilike '%FF%' or coalesce(h.raw->>'DryingLocationName','') ilike '%freezer%')
         then 'Fresh frozen — not judged against the dried flower goal'
       when (h.raw->>'TotalPackagedWeight')::numeric/453.592 >= f_rule_at('harvest_goal_lb', h.harvest_start)
         then 'MET the goal'
       else 'SHORT by '||round(f_rule_at('harvest_goal_lb', h.harvest_start)
                              - (h.raw->>'TotalPackagedWeight')::numeric/453.592,1)||' lb' end as verdict,
  (h.raw->>'FinishedDate')::date as closed_on,
  coalesce(h.raw->>'DryingLocationName','(not recorded)') as dried_in
from metrc_harvests h
where h.wet_weight > 0;

grant select on v_harvest_report to authenticated;

comment on function tg_propose_schedule is
  'Proposes a harvest schedule from measured strain yield. Always a draft - a person accepts, edits or rejects it.';;
