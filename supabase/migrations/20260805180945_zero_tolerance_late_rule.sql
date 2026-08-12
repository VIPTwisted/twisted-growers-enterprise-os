-- HARD RULE (owner): a pull or dry may be EARLY, never LATE. Late is a violation, full stop.
insert into harvest_alert_rules (rule_key, label, threshold, unit, severity, note) values
  ('late_tolerance_days', 'Late tolerance - ZERO', 0, 'days', 'critical',
   'Owner hard rule: harvests and drying may finish EARLY but must NEVER run late. Any day past schedule is a violation. If a date falls on a weekend, plan a weekend crew or a second shift - do not slip the date.'),
  ('early_allowance_days', 'Early allowance', 3, 'days', 'watch',
   'Pulling up to this many days early is acceptable and preferred over any delay.'),
  ('weekend_warning_days', 'Weekend landing warning lead time', 10, 'days',  'elevated',
   'How far ahead to warn cultivation that a scheduled pull or dry deadline lands on a Saturday or Sunday so a weekend crew or second shift can be planned.')
on conflict (rule_key) do update set threshold = excluded.threshold, note = excluded.note, severity = excluded.severity;

-- Weekend landings that need a crew planned, before they become late.
create or replace view v_weekend_watch as
select 'Scheduled pull' as event_type, p.pull_no, p.flower_room as room, p.cultivars as detail,
  p.harvest_date as event_date,
  trim(to_char(p.harvest_date, 'Day')) as falls_on,
  (p.harvest_date - current_date) as days_away,
  case when p.harvest_date < current_date then 'PAST - check it was not slipped'
       when (p.harvest_date - current_date) <= (select threshold from harvest_alert_rules where rule_key='weekend_warning_days')
         then 'PLAN A WEEKEND CREW OR SECOND SHIFT NOW'
       else 'Upcoming - plan coverage' end as action
from harvest_pulls p
where extract(dow from p.harvest_date) in (0,6) and p.harvest_date >= current_date - 14
union all
select 'Dry deadline (day 14)', null, m.room, m.strains,
  (m.harvest_start + 14),
  trim(to_char(m.harvest_start + 14, 'Day')),
  ((m.harvest_start + 14) - current_date),
  case when (m.harvest_start + 14) < current_date then 'PAST - confirm it was finished on time'
       when ((m.harvest_start + 14) - current_date) <= (select threshold from harvest_alert_rules where rule_key='weekend_warning_days')
         then 'PLAN A WEEKEND CREW OR SECOND SHIFT NOW'
       else 'Upcoming - plan coverage' end
from v_harvest_stage_map m
where m.stage not in ('Finished','Archived')
  and extract(dow from (m.harvest_start + 14)) in (0,6)
order by event_date;

-- Zero-tolerance scorecard: late counted as a violation, early counted as acceptable.
create or replace view v_late_violations as
select event_type, room, cultivars as detail, scheduled_date, actual_date, days_off_schedule,
  case
    when compliance like 'MISSED%' then 'VIOLATION - never happened'
    when compliance like 'LATE%' or compliance like 'DRY DEADLINE%' then 'VIOLATION - ran late'
    when compliance like 'Early%' then 'Acceptable - early'
    else 'On schedule' end as rule_verdict,
  case
    when compliance like 'MISSED%' or compliance like 'LATE%' or compliance like 'DRY DEADLINE%'
      then 'Every day late pushes the next cycle in this room. Weekend crew or second shift is the remedy, never a slipped date.'
    else null end as why_it_matters
from v_schedule_compliance
where compliance not in ('Scheduled')
order by
  case when compliance like 'MISSED%' then 0 when compliance like 'LATE%' or compliance like 'DRY DEADLINE%' then 1 else 2 end,
  days_off_schedule desc nulls last;

create or replace view v_schedule_discipline as
select
  count(*) filter (where rule_verdict like 'VIOLATION%')::numeric as violations,
  count(*) filter (where rule_verdict = 'Acceptable - early')::numeric as early_acceptable,
  count(*) filter (where rule_verdict = 'On schedule')::numeric as on_schedule,
  count(*)::numeric as total_events,
  round(100.0 * count(*) filter (where rule_verdict like 'VIOLATION%') / nullif(count(*),0), 1) as violation_rate_pct,
  round(avg(days_off_schedule) filter (where rule_verdict like 'VIOLATION%')::numeric, 1) as average_days_late,
  max(days_off_schedule) filter (where rule_verdict like 'VIOLATION%') as worst_days_late,
  (select count(*) from v_weekend_watch where action like 'PLAN A WEEKEND%') as weekend_events_needing_a_crew
from v_late_violations;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Late Violations (zero tolerance)', 20, 'shield', 'late_violations', 'v_late_violations', 'The hard rule enforced: a pull or dry may run EARLY but never late. Every late or missed event is listed as a violation with how many days it slipped and why it matters to the next cycle.'),
  ('Schedule Discipline', 21, 'gauge', 'schedule_discipline', 'v_schedule_discipline', 'The single number that matters: how many schedule violations, how many acceptable early finishes, the violation rate, the average and worst days late, and how many upcoming events land on a weekend and need a crew planned.'),
  ('Weekend Watch', 22, 'clock', 'weekend_watch', 'v_weekend_watch', 'Every scheduled pull and drying deadline that lands on a Saturday or Sunday, with how many days away it is and a direct instruction to plan a weekend crew or second shift before it becomes late.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select * from v_schedule_discipline;;
