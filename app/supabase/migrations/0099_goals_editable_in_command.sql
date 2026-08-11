/* 0099 — GOALS BECOME EDITABLE IN COMMAND, AND v_goal_status STOPS BEING A GHOST.
 *
 * Applied to fxetuqjryttnypgepsru on 11 Aug 2026. Written down because migrations
 * 0046-0098 were applied live and never committed: the schema baseline captured WHAT
 * they built and lost WHY. The reasoning below is the part a dump cannot carry.
 *
 * THREE DEFECTS, ALL LIVE BEFORE THIS.
 *
 * 1. v_goal_status DID NOT EXIST. budz-chat calls it on EVERY question:
 *      sb.from('v_goal_status').select('metric_label,actual,target,target_max,status')
 *    A missing relation errors, the supabase-js client swallows it into `error`, the
 *    destructured `data` is null, and `out.goals = null` ships as context. The assistant
 *    has never once seen a target it was supposed to measure against. Nothing surfaced
 *    because a null read looks exactly like an empty table - the same shape of silence
 *    that hid the Apex zero-row bug.
 *
 * 2. WRITES WERE OWNER/EXECUTIVE ONLY, via a role list hardcoded in the policy. The
 *    owner's rule is CEO, CFO and admins, plus anyone an admin later grants. Now matches
 *    f_can_manage_inventory exactly rather than inventing a second permission shape.
 *
 * 3. NO HARVEST OUTPUT TARGET EXISTED AT ALL.
 *
 * THE UNIT TRAP — the reason this file exists rather than a one-line insert.
 *
 * Owner, 11 Aug 2026: "TARGET IS 2 HARVESTS A MONTH EACH 180 TOTAL 360", and 180 is
 * POUNDS (confirmed, not inferred).
 *
 * But Metrc records 12-19 harvests a MONTH, because every room pull is its own harvest
 * row: 14 rows carried 368.5 packaged lb in Jul 2026, about 26 lb a row, not 180. So the
 * owner's "2 harvests" means TWO FACILITY PULLS, not two Metrc harvest records, and
 * harvest_plan_2026 agrees - it keys on pull_no and facility_days_since_last_pull.
 *
 * Scoring a count of Metrc harvest rows against a target of 2 would report the grow at
 * SEVEN TIMES PLAN. That is not a rounding error, it is a metric that would have been
 * quoted in a meeting.
 *
 * The measurable, unambiguous form of the owner's target is therefore POUNDS PACKAGED
 * PER MONTH, which needs no interpretation and ties straight to
 * v_monthly_conversion_truth.packaged_lb. The per-pull and pulls-per-month rows are
 * recorded too, with their actuals deliberately left NULL until facility pulls are
 * resolved from harvest_plan_2026 - a wrong denominator is worse than a blank.
 *
 * NOTHING HERE IS A BENCHMARK I INVENTED. Every seeded row carries provenance and is
 * marked owner-stated. Actuals that cannot be computed honestly return NULL and say why.
 * grams_per_sqft is the case in point: the owner has ruled there is NO square footage
 * recorded anywhere in this business and grow_rooms.sqft is null by design, so its actual
 * is structurally uncomputable and now SAYS SO instead of scoring the grow against a
 * published figure that was never ours.
 *
 * direction is constrained to at_least | at_most | between. Read from the live
 * constraint after 'up' was rejected - not assumed.
 */

/* ── 1 · who may edit a goal ─────────────────────────────────────────────── */
create or replace function public.f_can_manage_goals()
returns boolean language sql stable security definer
set search_path to 'public','pg_temp'
as $$
  select exists (select 1 from app_users u
                 where u.user_id = (select auth.uid())
                   and u.role = any (array['owner','executive','cfo','admin']::app_role[]))
      or public.f_role_can('manage_goals');
$$;

comment on function public.f_can_manage_goals() is
  'Who may edit cultivation_goals. Same shape as f_can_manage_inventory: the four senior
   roles always, plus any role an admin grants the manage_goals capability to.';

/* Registered for EVERY role already in role_capability, defaulting to false, so granting
   it later is a toggle in the permission screen and needs no code change. */
insert into role_capability (role, capability, allowed)
select distinct rc.role, 'manage_goals', false
from role_capability rc
where not exists (select 1 from role_capability x
                  where x.role = rc.role and x.capability = 'manage_goals')
on conflict do nothing;

/* ── 2 · the write policy follows the capability, not a hardcoded role list ── */
drop policy if exists cg_write on cultivation_goals;
create policy cg_write on cultivation_goals
  for all using (public.f_can_manage_goals())
  with check (public.f_can_manage_goals());

/* ── 3 · the owner's output target ───────────────────────────────────────── */
insert into cultivation_goals (metric_key, metric_label, target, target_max, unit, direction, enabled, benchmark_note, alert_owner)
values
  ('packaged_lb_per_month',
   'Packaged flower per month',
   360, null, 'lb', 'at_least', true,
   'OWNER-STATED 11 Aug 2026: two facility pulls a month at 180 lb each, so 360 lb a month. '
   'This is the measurable form of that target and needs no interpretation. NOT a published '
   'benchmark and NOT derived from our own history - the owner set it.',
   'owner'),
  ('packaged_lb_per_pull',
   'Packaged flower per facility pull',
   180, null, 'lb', 'at_least', true,
   'OWNER-STATED 11 Aug 2026. A FACILITY PULL, not a Metrc harvest row. Metrc records 12-19 '
   'harvest rows a month because each room pull is its own row (14 rows carried 368.5 lb in '
   'Jul 2026, about 26 lb a row). Never measure this against a count of metrc harvests.',
   'owner'),
  ('facility_pulls_per_month',
   'Facility pulls per month',
   2, null, 'count', 'at_least', true,
   'OWNER-STATED 11 Aug 2026. Counts FACILITY PULLS. harvest_plan_2026.pull_no is the unit, '
   'NOT a count of rows in the metrc harvest table - that count is 12-19 a month and scoring '
   'it against 2 would report the grow at seven times plan.',
   'owner')
on conflict do nothing;

/* ── 4 · the view budz-chat has been calling into thin air ───────────────── */
create view public.v_goal_status as
with recent as (
  select month, harvests_cut, harvests_closed, wet_lb, packaged_lb,
         conversion_pct_closed_only, avg_dry_days
  from v_monthly_conversion_truth
  order by month desc
  limit 1
)
select
  g.metric_key,
  g.metric_label,
  g.unit,
  g.target,
  g.target_max,
  g.direction,
  g.benchmark_note,
  (select month from recent) as measured_month,
  a.actual,
  a.basis,
  case
    when a.actual is null then 'no data'
    when g.direction = 'between' or g.target_max is not null
      then case when a.actual >= g.target and (g.target_max is null or a.actual <= g.target_max)
                then 'on target' else 'off target' end
    when g.direction = 'at_most'
      then case when a.actual <= g.target then 'on target' else 'off target' end
    else case when a.actual >= g.target then 'on target' else 'off target' end
  end as status
from cultivation_goals g
cross join lateral (
  select
    case g.metric_key
      when 'packaged_lb_per_month' then (select packaged_lb from recent)
      when 'conversion_pct'        then (select conversion_pct_closed_only from recent)
      when 'dry_days'              then (select avg_dry_days from recent)
      else null
    end::numeric as actual,
    case g.metric_key
      when 'packaged_lb_per_month' then 'v_monthly_conversion_truth.packaged_lb, most recent month'
      when 'conversion_pct'        then 'v_monthly_conversion_truth.conversion_pct_closed_only, closed harvests only'
      when 'dry_days'              then 'v_monthly_conversion_truth.avg_dry_days, most recent month'
      when 'grams_per_sqft'        then 'UNCOMPUTABLE - the owner has ruled there is no square footage recorded anywhere in this business, and grow_rooms.sqft is null by design. Never estimate it.'
      when 'packaged_lb_per_pull'  then 'NOT YET WIRED - needs facility pulls resolved from harvest_plan_2026.pull_no. A count of metrc harvest rows is the WRONG denominator.'
      when 'facility_pulls_per_month' then 'NOT YET WIRED - same reason as packaged_lb_per_pull.'
      else 'NOT YET WIRED - no verified source has been agreed for this metric. Left null deliberately rather than filled with a plausible figure.'
    end as basis
) a
where g.enabled;

comment on view public.v_goal_status is
  'Goal definitions with their actual where one can be computed HONESTLY, and NULL plus a
   stated reason where it cannot. Consumed by budz-chat on every question. An actual is
   never estimated to avoid an empty cell - a null with a reason is the correct answer and
   an invented number is not.';

grant select on public.v_goal_status to anon, authenticated;

/* KNOWN AND DELIBERATELY NOT FIXED HERE.
 *
 * conversion_pct now reads actual 70.9 against a 20-28 target and scores "off target".
 * That 70.9 is the FRESH-FROZEN TRAP: fresh frozen is packaged wet, so its conversion
 * reads near 100 percent and drags the month up. The metric is not measuring what its
 * label says.
 *
 * It is left exactly as it was. Re-basing a metric the owner has not agreed to re-base
 * would be tuning an input until a variance disappears, and the variance is the evidence.
 * Raised for a decision instead. Its benchmark_note also still asserts "Fresh flower is
 * 75-80 percent water" - published guidance, not our measured 73.5 percent, and the owner
 * has ruled it must not be quoted as ours. It is now editable in Command, which is where
 * that correction belongs.
 */
