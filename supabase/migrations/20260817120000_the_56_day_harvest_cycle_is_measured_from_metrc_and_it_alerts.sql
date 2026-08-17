/* The 56-day harvest cycle is measured from Metrc, live, and it alerts.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Production Schedule was printing "⚠ VIOLATION" on all 50 future rows from a
 * STORED text column on harvest_schedule, alongside a stored days_since_room_harvest
 * of 63 or 126 that was the same constant on every row of a room. Stored text cannot
 * be wrong loudly — it just sits there, so the badge became wallpaper and nobody
 * could tell a real breach from a stale one.
 *
 * The flag was also right, which is the part that matters. Measured against Metrc's
 * own harvest record over the last 400 days, no room has ever completed a 56-day
 * cycle: the observed cycles are 58, 59, 62, 63, 66, 68, 69, 70 and 83 days, with
 * 68-69 the most common. The facility cadence IS correct — 13 to 14 days between
 * pulls, one room coming down every other week, exactly as the owner states it.
 * The slip is per-room turnaround, and it compounds: at 56 days four rooms yield
 * 26 pulls a year, at the observed ~66 they yield ~22. That gap is four harvests.
 *
 * So this replaces the stored badge with a live derivation from metrc_harvests and
 * wires it to the watchdog, per the owner on 17 Aug 2026:
 *   "we must be able to pull reports to and system must flag and alert when not
 *    meeting the 56 day harvest cycle"
 *
 * COLLAPSING MULTI-DAY PULLS
 * --------------------------
 * A single takedown is recorded in Metrc across several consecutive days, one row
 * per strain. Naively lagging harvest_start therefore reports cycles of 1 and 3
 * days, which are not cycles at all — they are the same pull. Left uncollapsed
 * they drag the average down and hide the real breach. Consecutive harvest dates
 * within pull_event_span_days are folded into one pull event before any cycle is
 * measured. The span is a rule, not a literal, because upper management changes it.
 */

/* ── The span is editable, like every other operating number ─────────────────── */
insert into public.conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
  ('pull_event_span_days', 7, 'days', 'Same-pull window',
   'Harvest rows in one room whose dates fall within this many days of each other are '
   || 'one takedown, not separate cycles. Metrc records a single pull across several '
   || 'consecutive days, one row per strain.',
   'Measured from metrc_harvests: within-pull gaps observed at 1 and 3 days, '
   || 'between-pull gaps at 11 days and above. Seven separates them with room to spare.',
   'Agent I, Database COO', 'measured',
   'Derived 17 Aug 2026 from 385 harvests across F1-F4 over 400 days.')
on conflict (key) do nothing;

/* ── Every pull event, its cycle, and whether it met the rule ────────────────── */
create or replace view public.v_harvest_cycle_compliance as
with d as (
  select distinct flower_room, harvest_start
    from public.metrc_harvests
   where flower_room is not null
     and harvest_start is not null
),
marked as (
  select flower_room, harvest_start,
         case when harvest_start
                 - lag(harvest_start) over (partition by flower_room order by harvest_start)
                 <= public.f_rule('pull_event_span_days')::int
              then 0 else 1 end as starts_new_event
    from d
),
evented as (
  select flower_room, harvest_start,
         sum(starts_new_event) over (partition by flower_room order by harvest_start
                                     rows between unbounded preceding and current row) as event_no
    from marked
),
pulls as (
  select flower_room, event_no,
         min(harvest_start) as pull_start,
         max(harvest_start) as pull_end,
         count(*)::int      as days_recording
    from evented
   group by flower_room, event_no
),
cycled as (
  select p.*,
         lag(pull_start) over (partition by flower_room order by pull_start) as previous_pull_start,
         (pull_start - lag(pull_start) over (partition by flower_room order by pull_start))::int as cycle_days
    from pulls p
)
select
  c.flower_room,
  'Cultivation'::text                       as department,
  c.event_no,
  c.pull_start,
  c.pull_end,
  c.days_recording,
  c.previous_pull_start,
  c.cycle_days,
  public.f_rule('room_cycle_days')::int      as target_days,
  case when c.cycle_days is null then null
       else c.cycle_days - public.f_rule('room_cycle_days')::int end as variance_days,
  case
    when c.cycle_days is null
      then 'FIRST PULL ON RECORD — no previous cycle to measure'
    when c.cycle_days <= public.f_rule('room_cycle_days')::int
      then 'ON TARGET'
    else 'OVER BY ' || (c.cycle_days - public.f_rule('room_cycle_days')::int)::text || ' DAYS'
  end                                        as cycle_status,
  (c.cycle_days is not null
     and c.cycle_days > public.f_rule('room_cycle_days')::int) as breaches_rule,
  /* The arithmetic, spelled out, so a tile never has to be believed on trust. */
  case when c.cycle_days is null then 'no previous pull in Metrc for this room'
       else c.previous_pull_start::text || ' → ' || c.pull_start::text
            || ' = ' || c.cycle_days::text || ' days against a '
            || public.f_rule('room_cycle_days')::int::text || '-day rule'
  end                                        as the_arithmetic
from cycled c;

comment on view public.v_harvest_cycle_compliance is
  'Every harvest pull event per flower room, measured live from metrc_harvests, with '
  'its cycle length against conversion_factors.room_cycle_days. Multi-day takedowns are '
  'collapsed into one event using pull_event_span_days. Replaces the stored '
  'harvest_schedule.room_cycle_flag text, which could not be wrong loudly. '
  'Agent I, 17 Aug 2026.';

/* ── The room-level headline, which is what a tile shows ─────────────────────── */
create or replace view public.v_harvest_cycle_by_room as
select
  flower_room,
  department,
  count(*) filter (where cycle_days is not null)            as cycles_measured,
  count(*) filter (where breaches_rule)                     as cycles_over_target,
  min(cycle_days)                                           as fastest_cycle_days,
  max(cycle_days)                                           as slowest_cycle_days,
  round(avg(cycle_days), 1)                                 as average_cycle_days,
  max(target_days)                                          as target_days,
  round(avg(cycle_days), 1) - max(target_days)              as average_slip_days,
  max(pull_start)                                           as last_pull_start,
  (current_date - max(pull_start))::int                     as days_since_last_pull,
  max(pull_start) + max(target_days)                        as next_pull_due,
  (current_date - (max(pull_start) + max(target_days)))::int as days_overdue_now
from public.v_harvest_cycle_compliance
group by flower_room, department;

comment on view public.v_harvest_cycle_by_room is
  'One row per flower room: how the room actually cycles against the rule, and whether '
  'its next pull is already overdue. Feeds the Production Schedule tile. Agent I, 17 Aug 2026.';

/* ── The watchdog check, so the breach reaches a person rather than a badge ──── */
create or replace function public.f_check_harvest_cycle()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r          record;
  v_target   int := public.f_rule('room_cycle_days')::int;
  v_raised   int := 0;
  v_id       bigint;
begin
  for r in
    select * from public.v_harvest_cycle_by_room
     where cycles_over_target > 0 or days_overdue_now > 0
     order by flower_room
  loop
    /* One finding per room per rule value. A room that keeps missing the same rule
       is one unresolved issue, not a new one every night — H1 says an issue clears
       by a written decision, never by the passage of time. */
    insert into public.watchdog_findings (
      observed_at, fingerprint, severity, what, where_it_is, who_is_accountable,
      when_it_started, why_it_matters, how_it_was_detected, what_to_do,
      the_arithmetic, evidence, record_count, solutions, guard_recommendation)
    values (
      now(),
      'harvest_cycle_breach|' || r.flower_room || '|target=' || v_target,
      case when r.days_overdue_now > 14 then 'critical' else 'elevated' end,
      r.flower_room || ' is not meeting the ' || v_target || '-day harvest cycle: it '
        || 'averages ' || r.average_cycle_days || ' days, ' || r.average_slip_days
        || ' days over, across ' || r.cycles_measured || ' measured cycles.',
      'Flower room ' || r.flower_room || ', Cultivation. Source: metrc_harvests via '
        || 'v_harvest_cycle_compliance.',
      'Cultivation lead, and upper management for the rule itself.',
      'Last pull started ' || r.last_pull_start || ', ' || r.days_since_last_pull
        || ' days ago. Next pull was due ' || r.next_pull_due
        || case when r.days_overdue_now > 0
                then ' — ' || r.days_overdue_now || ' days ago.'
                else '.' end,
      'Every day of slip is lost capacity. Four rooms at a ' || v_target || '-day cycle '
        || 'yield ' || public.f_pulls_per_year() || ' pulls a year; at '
        || r.average_cycle_days || ' days they yield '
        || round(365.0 * 4 / nullif(r.average_cycle_days, 0), 0) || '. The facility '
        || 'cadence is correct at every other week — the loss is entirely room turnaround.',
      'Measured live from Metrc harvest records by f_check_harvest_cycle, comparing '
        || 'consecutive pull events per room against conversion_factors.room_cycle_days. '
        || 'Multi-day takedowns collapsed via pull_event_span_days.',
      'Cultivation to state what consumes the extra ' || r.average_slip_days
        || ' days between takedown and the next pull, or upper management to change '
        || 'room_cycle_days to the number the operation actually runs.',
      'Average ' || r.average_cycle_days || ' days against a ' || v_target
        || '-day rule = ' || r.average_slip_days || ' days slip per cycle. Observed range '
        || r.fastest_cycle_days || ' to ' || r.slowest_cycle_days || ' days.',
      jsonb_build_object('room', r.flower_room, 'target_days', v_target,
                         'average_cycle_days', r.average_cycle_days,
                         'cycles_measured', r.cycles_measured,
                         'cycles_over_target', r.cycles_over_target,
                         'last_pull_start', r.last_pull_start,
                         'next_pull_due', r.next_pull_due,
                         'days_overdue_now', r.days_overdue_now),
      r.cycles_over_target,
      array[
        'Record the turnaround steps between takedown and re-plant so the '
          || r.average_slip_days || ' days is visible rather than inferred.',
        'Change room_cycle_days in conversion_factors to the achievable number, which '
          || 'moves every schedule, forecast and assertion at once.',
        'Leave the rule at ' || v_target || ' and treat the gap as a stated improvement '
          || 'target, accepting that the badge stays lit until it closes.'
      ],
      'Do not change the rule to silence the badge. The ' || v_target || '-day cycle is '
        || 'the owner''s stated target and the flag is correct. Record what consumes the '
        || 'turnaround first — the number cannot be managed until it is visible.'
    )
    on conflict do nothing
    returning id into v_id;

    if v_id is not null then
      v_raised := v_raised + 1;
    end if;
  end loop;

  return v_raised;
end $function$;

comment on function public.f_check_harvest_cycle() is
  'Raises a watchdog finding for any flower room missing the room_cycle_days rule or '
  'already overdue for its next pull. Owner, 17 Aug 2026: the system must flag AND alert '
  'when the 56-day cycle is not met. Agent I.';

/* ── Catalogue the report that closes seed-to-sale, with the trap named ──────── */
insert into public.metrc_report_catalog
  (report_key, metrc_report_name, licence, target_table, header_row, file_pattern,
   date_filtered, pull_frequency, why, gotcha, active)
values
  ('packages_lineage_mc', 'Packages', 'MC281714', 'metrc_packages', 0,
   'Metrc-Massachusetts-MC281714-Packages*.xlsx', true, 'on a sync failure, or monthly',
   'The only source that links a package back to the harvest or package it came from. '
   || 'Without it a package has no parent and seed-to-sale stops at the harvest.',
   'MUST be built with the Source Harvest and Source Package columns selected. The '
   || 'default column set omits both. 14,822 of our 19,559 package rows arrived via a '
   || 'report built without them and have no parent as a result — against only 41 '
   || 'orphans among the API-sourced rows. Re-pull with lineage columns before trusting '
   || 'any harvest-to-package figure.', true),
  ('packages_lineage_mp', 'Packages', 'MP281909', 'metrc_packages', 0,
   'Metrc-Massachusetts-MP281909-Packages*.xlsx', true, 'on a sync failure, or monthly',
   'Same chain for the manufacturing licence, where a package''s parent is almost always '
   || 'another package rather than a harvest.',
   'Same trap: Source Harvest and Source Package are not in the default column set.', true)
on conflict (report_key) do update
  set gotcha = excluded.gotcha,
      why    = excluded.why,
      active = true,
      updated_at = now();
