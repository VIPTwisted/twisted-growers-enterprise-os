/* THE CULTIVATION ENGINE'S RULES BECOME LIVE OBJECTS — owner master build,
 * 19 Aug 2026, sections 5, 8 and 11.
 *
 * "4 rooms · 56-day cycle · harvest every other week · minimum 180 lb per pull
 *  · high-yield strains only · no strain below 26 % THC."
 *
 * Three of those were already live rules (180 lb, 2 pulls a month, tables
 * maximised). The cycle length, the room count and the entire strain
 * governance were not. They are now, in the same shape as every other owner
 * rule: a row he can change, taking effect everywhere in real time, with the
 * measurement beside it so a target is never confused with an actual.
 *
 * THE STRAIN TABLE IS OWNER-GOVERNED, NOT AGENT-GOVERNED. Every strain is
 * seeded ACTIVE with the company floor (26 % THC) and NO invented yield
 * target — a target nobody set is not a target, and this platform never
 * fabricates one. v_strain_gate measures each strain against the rules and
 * RECOMMENDS; only the owner flips active_flag, and every flip is kept in
 * strain_rule_history with who and why. */

insert into public.conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by) values
('flower_cycle_days', 56, 'days', 'Flower cycle length',
 'How long a room runs from flip to takedown. Four rooms on a 56-day cycle, staggered, is what produces a harvest every other week.',
 'Owner master build document, 19 Aug 2026.', 'Vinny'),
('grow_rooms_in_rotation', 4, 'rooms', 'Rooms in the harvest rotation',
 'How many flower rooms run the staggered cycle. Changing this changes the harvest calendar the OS generates and the pounds it expects per month.',
 'Owner master build document, 19 Aug 2026.', 'Vinny'),
('strain_min_thc_percent', 26, '%', 'Minimum THC for an approved strain',
 'No strain may be grown that tests below this. A strain repeatedly under it is recommended for removal from the grow list.',
 'Owner master build document, 19 Aug 2026: "no strain below 26% THC".', 'Vinny')
on conflict (key) do nothing;

create table if not exists public.strain (
  strain_id                    bigint generated always as identity primary key,
  name                         text not null unique,
  category                     text,
  target_yield_per_plant_lb    numeric,
  min_allowed_yield_per_plant_lb numeric,
  min_allowed_thc_percent      numeric not null default 26,
  active_flag                  boolean not null default true,
  low_scoring_historically     boolean not null default false,
  notes                        text,
  set_by                       text not null default 'seeded from Metrc, no owner ruling yet',
  updated_at                   timestamptz not null default now()
);

comment on table public.strain is
  'Owner-governed strain master (master build §8/§11): yield targets, the 26 % THC floor, and the '
  'active flag that gates planting. Seeded from Metrc with NO invented yield target — a target '
  'nobody set is not a target. v_strain_gate measures and recommends; only the owner flips '
  'active_flag, and strain_rule_history keeps every flip with who and why. Agent I, 19 Aug 2026.';

create table if not exists public.strain_rule_history (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  strain_name text not null,
  field text not null,
  old_value text,
  new_value text,
  changed_by text
);

create or replace function public.tg_strain_history() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if tg_op='UPDATE' then
    if new.active_flag is distinct from old.active_flag then
      insert into strain_rule_history(strain_name, field, old_value, new_value, changed_by)
      values (new.name,'active_flag',old.active_flag::text,new.active_flag::text,coalesce(new.set_by,'unknown'));
    end if;
    if new.target_yield_per_plant_lb is distinct from old.target_yield_per_plant_lb then
      insert into strain_rule_history(strain_name, field, old_value, new_value, changed_by)
      values (new.name,'target_yield_per_plant_lb',old.target_yield_per_plant_lb::text,new.target_yield_per_plant_lb::text,coalesce(new.set_by,'unknown'));
    end if;
    if new.min_allowed_thc_percent is distinct from old.min_allowed_thc_percent then
      insert into strain_rule_history(strain_name, field, old_value, new_value, changed_by)
      values (new.name,'min_allowed_thc_percent',old.min_allowed_thc_percent::text,new.min_allowed_thc_percent::text,coalesce(new.set_by,'unknown'));
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists strain_history on public.strain;
create trigger strain_history before update on public.strain
for each row execute function public.tg_strain_history();

alter table public.strain enable row level security;
alter table public.strain_rule_history enable row level security;
create policy strain_read on public.strain for select to authenticated using (true);
create policy strain_write on public.strain for all to authenticated
  using ((select f_caller_is_admin())) with check ((select f_caller_is_admin()));
create policy srh_read on public.strain_rule_history for select to authenticated using (true);

insert into public.strain (name, min_allowed_thc_percent, notes)
select distinct s.name, f_rule('strain_min_thc_percent'),
       'Seeded from the Metrc strain list 19 Aug 2026. No owner yield target set yet — the OS will not invent one.'
from metrc_strains s where coalesce(s.name,'') <> ''
on conflict (name) do nothing;

/* THE GATE: every strain measured against the owner's rules, with the
   recommendation stated and the decision left to him. */
create or replace view public.v_strain_gate as
with potency as (
  select coalesce(p.raw #>> '{Item,StrainName}', 'unknown') as strain,
         count(*) filter (where c.total_thc is not null)          as coas,
         round(avg(c.total_thc)::numeric, 2)                      as avg_thc,
         round(min(c.total_thc)::numeric, 2)                      as min_thc,
         round(max(c.total_thc)::numeric, 2)                      as max_thc,
         count(*) filter (where c.total_thc < f_rule('strain_min_thc_percent')) as coas_under_floor,
         max(c.report_date)                                       as latest_coa
  from coa_extract c
  join (select distinct on (d.tag) d.tag, d.raw from metrc_packages d
        order by d.tag, d.synced_at desc nulls last) p on p.tag = c.package_tag
  where c.total_thc is not null
  group by 1
),
yield as (
  select h.strain,
         count(*) filter (where h.harvest_closed is not null)     as closed_harvests,
         round(avg(h.packaged_g_per_plant) filter (where h.harvest_closed is not null)::numeric, 1) as avg_g_per_plant,
         round((avg(h.packaged_g_per_plant) filter (where h.harvest_closed is not null) / 453.59237)::numeric, 4) as avg_lb_per_plant,
         round(avg(h.packaged_lb) filter (where h.harvest_closed is not null)::numeric, 1) as avg_pull_lb
  from v_harvest_forensic h where coalesce(h.strain,'') <> '' group by 1
)
select st.name                          as strain,
       st.active_flag,
       st.min_allowed_thc_percent       as thc_floor,
       p.coas, p.avg_thc, p.min_thc, p.coas_under_floor, p.latest_coa,
       st.target_yield_per_plant_lb     as yield_target_lb,
       y.closed_harvests, y.avg_lb_per_plant, y.avg_pull_lb,
       f_rule('required_lb_per_pull')   as pull_floor_lb,
       case
         when p.coas is null                                     then 'NO POTENCY EVIDENCE — never tested, or its COAs carry no THC figure'
         when p.avg_thc < st.min_allowed_thc_percent             then 'BELOW THE FLOOR — averages ' || p.avg_thc || ' % against a ' || st.min_allowed_thc_percent || ' % minimum'
         when p.coas_under_floor > 0                             then 'MIXED — ' || p.coas_under_floor || ' of ' || p.coas || ' certificates came in under the floor'
         else 'MEETS THE POTENCY RULE'
       end                              as potency_verdict,
       case
         when y.closed_harvests is null                          then 'NO YIELD HISTORY — no closed harvest of this strain'
         when st.target_yield_per_plant_lb is null               then 'NO OWNER TARGET SET — measured ' || coalesce(y.avg_lb_per_plant::text,'?') || ' lb per plant across ' || y.closed_harvests || ' harvests'
         when y.avg_lb_per_plant < st.min_allowed_yield_per_plant_lb then 'UNDER THE YIELD MINIMUM'
         else 'MEETS THE YIELD RULE'
       end                              as yield_verdict,
       case
         when p.avg_thc is not null and p.avg_thc < st.min_allowed_thc_percent and st.active_flag
           then 'RECOMMEND DISABLING — potency below the company floor'
         when st.low_scoring_historically and st.active_flag
           then 'RECOMMEND DISABLING — flagged low scoring'
         when not st.active_flag then 'Already disabled'
         else 'No action'
       end                              as recommendation
from strain st
left join potency p on p.strain = st.name
left join yield   y on y.strain = st.name;

comment on view public.v_strain_gate is
  'Every strain measured against the owner rules (master build §8/§11): THC floor from '
  'conversion_factors.strain_min_thc_percent, yield against his target where one is set, and a '
  'RECOMMENDATION he decides on. Potency is measured from the certificates themselves — the '
  'independent source — never from a Metrc field. Agent I, 19 Aug 2026.';

grant select on public.v_strain_gate to authenticated;;
