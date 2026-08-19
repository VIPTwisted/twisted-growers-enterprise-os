/* THE 26 % RULE IS A CULTIVATOR SOURCING RULE, NOT A SELL GATE — owner ruling,
 * 19 Aug 2026, settling the conflict I raised:
 *
 *   "NO — that we cannot sell. Our cultivator is expected to find and harvest
 *    strains known for high testing and submit these for CEO, COO, CFO, owner
 *    review, and the OS must research strain yields and testing scores online
 *    looking for if they won any awards, how they yield indoors, difficulty of
 *    growing, and yields. We the company will edit all this data for what % we
 *    need so DO NOT HARDCODE IT. Obviously we may test lower and we will sell
 *    such goods, but our cultivator will now have rules that must be followed
 *    and we can monitor now."
 *
 * So: nothing is ever blocked from sale on potency. The floor governs WHAT WE
 * PLANT, and it is a monitoring instrument on the cultivator's sourcing. Every
 * threshold stays a row he can edit — the floor already reads
 * settings.strain_min_thc_percent and no number is written into any view.
 *
 * WHAT THIS ADDS
 *  1. RESEARCH FIELDS on strain — awards, indoor yield, grow difficulty,
 *     breeder, reported potency range, flowering time — every one with its
 *     SOURCE and the date it was gathered, because a researched claim without
 *     a source is a rumour and this platform does not publish rumours.
 *  2. AN EXECUTIVE APPROVAL WORKFLOW. The cultivator proposes; the CEO, COO,
 *     CFO and owner review; nobody grows anything not approved. This is the
 *     "nothing is ever automatic" rule applied to genetics: the OS recommends
 *     and records, a named person decides.
 *  3. The strain gate's language changes from a compliance verdict to a
 *     SOURCING verdict, so nobody reads it as a reason to hold stock. */

alter table public.strain
  add column if not exists breeder                text,
  add column if not exists awards                 text,
  add column if not exists reported_thc_low       numeric,
  add column if not exists reported_thc_high      numeric,
  add column if not exists indoor_yield_g_per_plant numeric,
  add column if not exists indoor_yield_g_per_sqm numeric,
  add column if not exists flowering_days         integer,
  add column if not exists grow_difficulty        text,
  add column if not exists research_source        text,
  add column if not exists research_notes         text,
  add column if not exists researched_on          date,
  add column if not exists researched_by          text,
  add column if not exists approval_status        text not null default 'not_reviewed',
  add column if not exists proposed_by            text,
  add column if not exists proposed_on            date,
  add column if not exists decided_by             text,
  add column if not exists decided_on             date,
  add column if not exists decision_notes         text;

alter table public.strain drop constraint if exists strain_approval_status_check;
alter table public.strain add constraint strain_approval_status_check
  check (approval_status in ('not_reviewed','proposed','under_review','approved','rejected','retired'));

comment on column public.strain.awards is
  'Cannabis Cup and other competition results found in research, with the year. Owner instruction '
  '19 Aug 2026: the OS researches awards, indoor yield, grow difficulty and testing scores so the '
  'cultivator proposes on evidence, not reputation. Always carries research_source.';
comment on column public.strain.approval_status is
  'not_reviewed -> proposed (cultivator submits) -> under_review -> approved | rejected | retired. '
  'Only an approved strain may be planted. Owner ruling 19 Aug 2026: the cultivator proposes, the '
  'CEO/COO/CFO/owner decide. Nothing automatic.';
comment on column public.strain.min_allowed_thc_percent is
  'The SOURCING floor for this strain — what the cultivator is expected to find, NOT a sell gate. '
  'Owner ruling 19 Aug 2026: "obviously we may test lower and we will sell such goods." Defaults '
  'from settings.strain_min_thc_percent (26) and is editable per strain. Never hardcoded.';

create table if not exists public.strain_review (
  review_id     bigint generated always as identity primary key,
  strain_name   text not null references public.strain(name) on update cascade,
  action        text not null check (action in ('proposed','commented','approved','rejected','retired','reopened')),
  by_role       text not null,
  by_user       text not null,
  at            timestamptz not null default now(),
  rationale     text not null,
  evidence      jsonb
);

comment on table public.strain_review is
  'The executive review trail for genetics (owner ruling 19 Aug 2026): who proposed a strain, who '
  'commented, who approved or rejected it, and the written rationale every time. A rationale is '
  'NOT NULL — a decision without a reason is not a decision anyone can audit. Agent I.';

alter table public.strain_review enable row level security;
create policy sr_read  on public.strain_review for select to authenticated using (true);
create policy sr_write on public.strain_review for insert to authenticated
  with check ((select f_caller_is_admin()));

create or replace function public.tg_strain_review_applies() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  update strain s set
    approval_status = case new.action
                        when 'proposed' then 'proposed'
                        when 'approved' then 'approved'
                        when 'rejected' then 'rejected'
                        when 'retired'  then 'retired'
                        when 'reopened' then 'under_review'
                        else s.approval_status end,
    active_flag     = case new.action
                        when 'approved' then true
                        when 'rejected' then false
                        when 'retired'  then false
                        else s.active_flag end,
    decided_by      = case when new.action in ('approved','rejected','retired') then new.by_user else s.decided_by end,
    decided_on      = case when new.action in ('approved','rejected','retired') then new.at::date else s.decided_on end,
    decision_notes  = case when new.action in ('approved','rejected','retired') then new.rationale else s.decision_notes end,
    proposed_by     = case when new.action = 'proposed' then new.by_user else s.proposed_by end,
    proposed_on     = case when new.action = 'proposed' then new.at::date else s.proposed_on end,
    set_by          = new.by_user
  where s.name = new.strain_name;
  return new;
end $$;

drop trigger if exists strain_review_applies on public.strain_review;
create trigger strain_review_applies after insert on public.strain_review
for each row execute function public.tg_strain_review_applies();

/* THE CULTIVATOR'S DESK: what needs researching, what needs deciding, and the
   measured performance of everything already growing. */
create or replace view public.v_strain_desk as
select g.strain,
       s.approval_status,
       s.active_flag,
       s.proposed_by, s.proposed_on, s.decided_by, s.decided_on,
       s.breeder, s.awards, s.reported_thc_low, s.reported_thc_high,
       s.indoor_yield_g_per_plant, s.flowering_days, s.grow_difficulty,
       s.research_source, s.researched_on,
       g.coas          as flower_coas_measured,
       g.avg_thc       as measured_avg_thc,
       g.max_thc       as measured_best_thc,
       g.thc_floor     as sourcing_floor,
       g.closed_harvests, g.avg_lb_per_plant as measured_lb_per_plant, g.avg_pull_lb,
       case
         when s.research_source is null then 'RESEARCH NEEDED — no awards, yield or difficulty evidence gathered yet'
         when s.approval_status = 'not_reviewed' then 'AWAITING PROPOSAL — researched but the cultivator has not submitted it'
         when s.approval_status = 'proposed'     then 'AWAITING EXECUTIVE DECISION — CEO, COO, CFO or owner'
         when s.approval_status = 'under_review' then 'UNDER REVIEW'
         when s.approval_status = 'approved'     then 'APPROVED FOR PLANTING'
         when s.approval_status = 'rejected'     then 'REJECTED — not to be planted'
         when s.approval_status = 'retired'      then 'RETIRED from the grow list'
       end as desk_state,
       case
         when g.coas is null then 'No flower certificate yet — nothing measured to judge sourcing on'
         when g.avg_thc >= g.thc_floor then 'SOURCING RULE MET — flower averages ' || g.avg_thc || ' % against the ' || g.thc_floor || ' % target'
         else 'SOURCING RULE MISSED — flower averages ' || g.avg_thc || ' % against the ' || g.thc_floor
              || ' % target. This is a CULTIVATION sourcing question, never a reason to hold stock: the material sells.'
       end as sourcing_verdict
from v_strain_gate g
join strain s on s.name = g.strain;

comment on view public.v_strain_desk is
  'The cultivator''s desk and the executive review queue in one place (owner ruling 19 Aug 2026): '
  'researched evidence (awards, indoor yield, difficulty, breeder, reported range) beside MEASURED '
  'performance (our own certificates and harvests), with the approval state. The potency verdict '
  'is a SOURCING verdict — "obviously we may test lower and we will sell such goods" — and says so '
  'on every row so nobody reads it as a hold on inventory. Agent I.';

grant select on public.v_strain_desk, public.strain_review to authenticated;

insert into public.gap_rule (gap_type, family, severity, detects, detector, threshold_key, what_it_catches, why_not_yet)
values
 ('strain_research_missing','cultivation','info',true,'v_strain_desk',null,
  'A strain being grown with no researched evidence — no awards, indoor yield or difficulty on record.',null),
 ('strain_not_approved','cultivation','warning',true,'v_strain_desk',null,
  'A strain in the ground that no executive has approved for planting.',null)
on conflict (gap_type) do update set what_it_catches=excluded.what_it_catches, detects=excluded.detects, detector=excluded.detector;;
