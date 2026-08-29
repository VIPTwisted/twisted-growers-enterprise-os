-- HARVEST CONTROL LAW, item 2: the scheduled dry target against what Metrc says
-- came off. docs/HARVEST_CONTROL_LAW.md, owner 28 Aug 2026.
--
-- NOT APPLIED. Written, reviewed and proven by SELECT against production, and
-- held for the owner's APPLY. Every figure quoted in the PR came from running
-- this query read-only, not from running the view.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE LAW SAYS: "Never blend a scheduled pound into a Metrc pound. Show both.
-- Gap is the finding." So there is no column here that mixes them, and the two
-- systems of record are named on every row.
--
--   Schedule, dry target, contracted minimum  ->  TG policy, owner-editable
--   Plants, wet, waste, packaged, tests       ->  Metrc, the legal record
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE GRAIN, WHICH IS THE WHOLE DIFFICULTY.
--
-- A Metrc harvest is one STRAIN coming out of one room. A scheduled pull is the
-- whole room on a date, and the plan's dry target is a PULL total. Measured:
-- 15 linked pulls carry 100 Metrc harvests - 6.7 each on average, up to 11.
--
-- So comparing one harvest's packaged weight against its pull's target
-- understates by about six and a half times. That is the same class of error the
-- locked facts record as costing a day: grams per plant read against grams per
-- square foot, a finding wrong by a factor of six.
--
-- This view therefore computes the gap AT PULL GRAIN and repeats it on each
-- harvest row, with the harvest's own contribution beside it and both labelled.
-- A per-harvest weight is never subtracted from a per-pull target anywhere in
-- this file.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- UNITS. v_harvest_pull_link.wet_weight is RAW GRAMS off the Metrc mirror;
-- projected_flower_after_ff_lb is POUNDS. Subtracting them directly is a 453x
-- error. Everything below is converted through f_to_pounds() first.
--
-- LINK QUALITY IS CARRIED, NOT HIDDEN. v_harvest_pull_link already judges its
-- own matches and says when one is weak - pull 10 links a single harvest whose
-- room drifted from the planned F4 to F2, and its own note says the link "is by
-- DATE ONLY and is therefore not evidence of adherence". Read naively that pull
-- shows a 129.7 lb shortfall. It is not a proven shortfall, it is one harvest
-- matched on a date, so the status refuses to call it one and the note travels
-- with the row.
--
-- WHAT THIS VIEW MAY NOT DO, from the law:
--   · print a scheduled weight as a harvested weight - they are separate columns
--   · read an empty or 0 dry as "no harvest" when Metrc holds a harvest id -
--     zero packaged with a harvest id reads "no dry weight recorded yet", never 0
--   · close a shortfall quietly - status is computed, never stored, never closed
--   · write anything back to Metrc - this is a read-only view over the mirror
create or replace view public.v_harvest_schedule_vs_metrc
with (security_invoker = true) as
with h as (
  select
    mh.id                                          as harvest_id,
    mh.name                                        as harvest_name,
    mh.license                                     as licence,
    mh.harvest_start                               as harvest_started,
    nullif(mh.raw->>'FinishedDate','')::date       as harvest_closed,
    nullif(mh.raw->>'DryingLocationName','')       as drying_room,
    (mh.raw->>'PlantCount')::numeric               as plants,
    mh.synced_at::date                             as metrc_as_of,
    f_to_pounds((mh.raw->>'TotalWetWeight')::numeric,       mh.raw->>'UnitOfWeightName') as wet_lb,
    f_to_pounds((mh.raw->>'TotalWasteWeight')::numeric,     mh.raw->>'UnitOfWeightName') as waste_lb,
    f_to_pounds((mh.raw->>'TotalPackagedWeight')::numeric,  mh.raw->>'UnitOfWeightName') as packaged_lb,
    (mh.raw->>'TotalPackagedWeight')::numeric      as packaged_native,
    f_harvest_weight_basis(mh.name, mh.raw->>'DryingLocationName',
                           (mh.raw->>'CurrentWeight')::numeric)                          as weight_basis
  from public.metrc_harvests mh
),
linked as (
  select h.*,
         l.pull_no, l.pull_planned_date, l.days_from_planned_pull,
         l.room_planned, l.room_actual, l.link_note, l.name_date_disagreement,
         l.projected_flower_after_ff_lb as sched_dry_lb
  from h
  left join public.v_harvest_pull_link l on l.harvest_id = h.harvest_id
),
/* The pull is where the target lives, so it is where the gap is computed.
   max(sched_dry_lb) not sum(): the link view repeats the pull's single target on
   every harvest row. Verified on production that no pull carries two different
   targets, so max is the value and not a choice between values. */
pull as (
  select pull_no,
         max(sched_dry_lb)                                   as pull_sched_dry_lb,
         count(*)                                            as harvests_in_pull,
         count(*) filter (where harvest_closed is null)      as harvests_still_open,
         sum(packaged_lb)                                    as pull_packaged_lb,
         sum(wet_lb)                                         as pull_wet_lb,
         bool_or(link_note ilike '%not evidence of adherence%'
              or link_note ilike '%ROOM DRIFTED%')           as pull_link_is_weak
  from linked
  where pull_no is not null
  group by pull_no
)
select
  l.harvest_id,
  l.harvest_name,
  l.licence,
  l.drying_room,
  l.plants,
  l.harvest_started,
  l.harvest_closed,
  case l.weight_basis
    when 'wet' then 'Fresh frozen (wet basis)'
    when 'dry' then 'Dried flower'
    else 'Unknown basis' end                                  as stream,

  /* ── the schedule side, TG policy ───────────────────────────────────────── */
  l.pull_no                                                   as scheduled_pull_no,
  l.pull_planned_date                                         as scheduled_pull_date,
  l.days_from_planned_pull,
  l.room_planned                                              as scheduled_room,
  l.room_actual                                               as actual_room,
  round(p.pull_sched_dry_lb, 1)                               as scheduled_dry_lb_for_the_pull,

  /* ── the Metrc side, the legal record ───────────────────────────────────── */
  round(l.wet_lb, 1)                                          as metrc_wet_lb,
  round(l.waste_lb, 1)                                        as metrc_waste_lb,
  /* RULE: zero packaged against a real harvest id is NOT zero pounds, it is a
     weight that has not been recorded. The number stays null and the text says
     which of the two it is. */
  case when l.packaged_native > 0 then round(l.packaged_lb, 1) end
                                                              as metrc_packaged_lb,
  case
    when l.packaged_native > 0            then 'recorded'
    when l.harvest_closed is null         then 'NOT RECORDED YET - the harvest is still open in Metrc'
    else                                       'NOT RECORDED - the harvest is closed in Metrc and nothing was ever packaged off it'
  end                                                         as metrc_packaged_state,

  /* ── the pull, which is the grain the target is set at ──────────────────── */
  p.harvests_in_pull,
  p.harvests_still_open,
  round(p.pull_wet_lb, 1)                                     as pull_metrc_wet_lb,
  round(p.pull_packaged_lb, 1)                                as pull_metrc_packaged_lb,

  /* ── the gap. Pull grain, both sides shown, never blended ───────────────── */
  round(p.pull_packaged_lb - p.pull_sched_dry_lb, 1)          as gap_lb,
  case when p.pull_sched_dry_lb > 0
       then round(100.0 * (p.pull_packaged_lb - p.pull_sched_dry_lb) / p.pull_sched_dry_lb, 1)
  end                                                         as gap_pct,

  case
    when l.pull_no is null then
      'NO SCHEDULED PULL - this harvest is not on the plan, so there is no target to miss'
    when p.harvests_still_open > 0 then
      'OPEN - ' || p.harvests_still_open || ' of ' || p.harvests_in_pull
      || ' harvests in this pull are still open, so the dry weight is not final'
    when p.pull_link_is_weak then
      'LINK TOO WEAK TO JUDGE - the schedule and Metrc were matched on date alone '
      || 'and the room drifted, so this difference is not evidence of a shortfall'
    when p.pull_packaged_lb >= p.pull_sched_dry_lb then
      'AT OR ABOVE TARGET'
    else
      'SHORTFALL'
  end                                                         as status,

  /* ── provenance, on every row ───────────────────────────────────────────── */
  l.link_note,
  l.name_date_disagreement,
  'metrc_harvests (Metrc API mirror)'::text                   as metrc_source,
  l.metrc_as_of,
  'harvest_plan_2026 via v_harvest_pull_link'::text           as schedule_source,
  'pull_link_window_days'::text                               as link_rule_used,
  f_rule('pull_link_window_days')                             as link_rule_days,
  'The target is a PULL total and a Metrc harvest is one strain from one room - 6.7 harvests per pull on average. '
  || 'The gap is therefore computed at pull grain and repeated on each harvest row; the harvest''s own weights are '
  || 'beside it for context and are never subtracted from the pull target.'::text as grain_caveat
from linked l
left join pull p on p.pull_no = l.pull_no
order by l.pull_planned_date desc nulls last, l.harvest_name;

comment on view public.v_harvest_schedule_vs_metrc is
'HARVEST CONTROL LAW item 2. The scheduled dry target (TG policy, harvest_plan_2026 via v_harvest_pull_link) against what Metrc says came off, one row per Metrc harvest. Scheduled and Metrc pounds are never blended - both are shown and the gap is the finding. The gap is computed at PULL grain because that is where the target is set: a pull carries 6.7 Metrc harvests on average, so a per-harvest comparison would understate it six-fold. Zero packaged against a real harvest id reads as "not recorded", never as zero pounds. Where the schedule-to-Metrc link is weak the status refuses to call a shortfall and says why.';
