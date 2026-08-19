/* THE RULE SITS AT THE INTAKE POINT — owner ruling, 19 Aug 2026, binding:
 *
 *   "THERE IS NO FUCKING RULE ON SELLING. THIS IS FOR WHAT CLONES AND SEEDS
 *    THE CULTIVATOR CAN BRING IN TO BE HARVESTED AS STRAINS ONLY."
 *
 * Everything potency-related governs GENETICS COMING IN. Nothing anywhere in
 * this OS may hold, flag or gate a sale on potency — we sell what we harvest.
 *
 * Four rulings recorded and implemented:
 *  1. 26 % is a SOURCING rule on clones and seeds. Sales unrestricted.
 *  2. NOTHING AUTOMATIC. The OS proposes and alerts; a named executive
 *     decides. No auto-disable, no auto-flag-flip. (Enforced structurally:
 *     active_flag only changes through strain_review, which requires a
 *     written rationale and a named person.)
 *  3. Guards block OS OPERATIONS ONLY — never Metrc. Metrc is detected and
 *     reconciled, never commanded.
 *  4. Caching is allowed where freshness is shown and watched.
 *
 * strain_research is its own table because a strain has MANY research
 * findings from many sources, and collapsing them into one row would force
 * the OS to pick a winner silently. Each row carries its source and who
 * gathered it; leadership edits the REQUIREMENTS on strain, never the
 * research, so evidence and decision never get confused. */

create table if not exists public.strain_research (
  research_id      bigint generated always as identity primary key,
  strain_name      text not null,
  source_name      text not null,
  source_url       text,
  indoor_yield_g_per_plant numeric,
  indoor_yield_g_per_sqm   numeric,
  reported_thc_low  numeric,
  reported_thc_high numeric,
  terpene_profile   text,
  flowering_days    integer,
  grow_difficulty   text,
  awards            text,
  grower_reviews    text,
  breeder_notes     text,
  gathered_on       date not null default current_date,
  gathered_by       text not null,
  confidence        text check (confidence in ('breeder_official','seed_bank','review_aggregate','forum_anecdote','unverified')),
  notes             text
);

create index if not exists strain_research_strain on public.strain_research (strain_name);

comment on table public.strain_research is
  'Owner requirement 19 Aug 2026: the OS researches strains online — indoor yield, difficulty, '
  'award history, typical THC range, terpene profile, grower reviews, breeder notes — and stores '
  'every finding here with ITS SOURCE. Many rows per strain by design: a strain has many sources '
  'and collapsing them to one row would make the OS pick a winner silently. confidence grades the '
  'source, because a breeder claim and a forum post are not the same evidence. Leadership edits '
  'the REQUIREMENTS on strain; nobody edits the research. Agent I.';

alter table public.strain_research enable row level security;
create policy srch_read  on public.strain_research for select to authenticated using (true);
create policy srch_write on public.strain_research for all to authenticated
  using ((select f_caller_is_admin())) with check ((select f_caller_is_admin()));

/* THE INTAKE GATE. This is where the rule actually bites: a clone or seed lot
   the cultivator wants to bring in. Not a harvest, not a package, not a sale. */
create table if not exists public.genetics_intake (
  intake_id       bigint generated always as identity primary key,
  strain_name     text not null,
  source_type     text not null check (source_type in ('clone','seed','tissue_culture','mother_plant')),
  supplier        text,
  quantity        integer,
  proposed_by     text not null,
  proposed_on     date not null default current_date,
  intended_room   text,
  status          text not null default 'proposed'
                  check (status in ('proposed','under_review','approved','rejected','received','cancelled')),
  decided_by      text,
  decided_on      date,
  decision_notes  text,
  exception_granted boolean not null default false,
  exception_reason  text
);

comment on table public.genetics_intake is
  'THE GATE POINT. Owner ruling 19 Aug 2026: the potency and yield rules govern "what clones and '
  'seeds the cultivator can bring in to be harvested as strains only" — not sales, not harvests, '
  'not packages. One row per proposed intake, decided by a named executive. An intake of a strain '
  'below the sourcing floor is REFUSED unless an exception is granted with a written reason — the '
  'owner''s "allow exceptions with reviewer approval". Agent I.';

alter table public.genetics_intake enable row level security;
create policy gi_read  on public.genetics_intake for select to authenticated using (true);
create policy gi_write on public.genetics_intake for all to authenticated
  using ((select f_caller_is_admin())) with check ((select f_caller_is_admin()));

create or replace view public.v_genetics_intake_review as
select i.intake_id, i.strain_name, i.source_type, i.supplier, i.quantity,
       i.proposed_by, i.proposed_on, i.intended_room, i.status,
       s.approval_status                        as strain_standing,
       s.min_allowed_thc_percent                as sourcing_floor,
       s.target_yield_per_plant_lb              as yield_target,
       g.avg_thc                                as our_measured_thc,
       g.coas                                   as our_flower_coas,
       g.avg_lb_per_plant                       as our_measured_lb_per_plant,
       r.best_reported_thc, r.best_indoor_yield_g, r.sources_researched, r.awards_found,
       case
         when s.name is null
           then 'UNKNOWN STRAIN — not on the strain list. Research it and add it before proposing intake.'
         when r.sources_researched is null
           then 'NO RESEARCH ON FILE — the OS has gathered no yield, award or potency evidence for this strain yet.'
         when g.avg_thc is not null and g.avg_thc < s.min_allowed_thc_percent
           then 'OUR OWN FLOWER AVERAGES ' || g.avg_thc || ' % — below the ' || s.min_allowed_thc_percent
                || ' % sourcing floor. Refuse the intake, or grant an exception with a written reason.'
         when coalesce(r.best_reported_thc, 0) < s.min_allowed_thc_percent
           then 'RESEARCH REPORTS A CEILING OF ' || coalesce(r.best_reported_thc,0) || ' % — below the '
                || s.min_allowed_thc_percent || ' % sourcing floor. Refuse, or grant an exception with a reason.'
         when i.exception_granted
           then 'EXCEPTION GRANTED — ' || coalesce(i.exception_reason,'no reason recorded, which is itself a defect')
         else 'MEETS THE SOURCING RULE on the evidence held'
       end                                      as intake_verdict,
       'This decides what may be PLANTED. It has no bearing on what may be sold — the owner ruled 19 Aug 2026 that there is no potency rule on selling.'::text as scope_note
from genetics_intake i
left join strain s on s.name = i.strain_name
left join v_strain_gate g on g.strain = i.strain_name
left join (
  select strain_name,
         max(reported_thc_high)          as best_reported_thc,
         max(indoor_yield_g_per_plant)   as best_indoor_yield_g,
         count(*)                        as sources_researched,
         string_agg(distinct nullif(awards,''), ' · ') as awards_found
  from strain_research group by strain_name
) r on r.strain_name = i.strain_name;

comment on view public.v_genetics_intake_review is
  'The executive decision screen for genetics intake: what the cultivator wants to bring in, the '
  'researched evidence, OUR OWN measured performance of that strain, and the sourcing verdict — '
  'with an exception path that requires a written reason. Every row states that this governs '
  'planting only and never sales. Agent I, 19 Aug 2026.';

grant select on public.v_genetics_intake_review to authenticated;

/* NOTHING AUTOMATIC — made structural, not merely stated. The strain gate may
   only ever RECOMMEND; active_flag moves through strain_review, which demands
   a named person and a written rationale. This trigger refuses any other path. */
create or replace function public.tg_strain_flag_needs_a_person() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $$
begin
  if new.active_flag is distinct from old.active_flag
     and coalesce(new.set_by,'') in ('', 'loop', 'watcher', 'cron', 'seeded from Metrc, no owner ruling yet') then
    raise exception 'NOTHING IS EVER AUTOMATIC (owner rule, 8 and 19 Aug 2026). A strain''s '
                    'active_flag may only change through strain_review, with a named person and a '
                    'written rationale. The OS proposes; a human decides.';
  end if;
  return new;
end $$;

drop trigger if exists strain_flag_needs_a_person on public.strain;
create trigger strain_flag_needs_a_person before update on public.strain
for each row execute function public.tg_strain_flag_needs_a_person();

insert into public.gap_rule (gap_type, family, severity, detects, detector, threshold_key, what_it_catches, why_not_yet)
values ('genetics_intake_below_sourcing_floor','cultivation','warning',true,'v_genetics_intake_review',
        'strain_min_thc_percent',
        'A proposed clone or seed intake for a strain whose evidence sits below the sourcing floor. Governs PLANTING only — never sales.', null)
on conflict (gap_type) do update set what_it_catches=excluded.what_it_catches, detects=excluded.detects, detector=excluded.detector;;
