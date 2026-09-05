-- Applied prod 20260905151255. Do not re-apply.
-- One row per distinct unresolved problem from v_alert_center.
-- NOT a second alert system. Ledger not rewritten.

create or replace view public.v_five_alarm as
with stripped as (
  select
    v_alert_center.severity,
    v_alert_center.source,
    v_alert_center.ticket_assignee,
    v_alert_center.days_open,
    v_alert_center.ticket,
    v_alert_center.ticket_status,
    v_alert_center.ticket_due,
    regexp_replace(
      regexp_replace(
        v_alert_center.subject,
        '^(STILL OPEN \\([0-9]+ reminders?, [0-9]+ days?\\)|ESCALATED after [0-9]+ days?|CRITICAL|ELEVATED|WARNING|REOPENED|RESOLVED):\\s*',
        '',
        'i'
      ),
      '^(STILL OPEN \\([0-9]+ reminders?, [0-9]+ days?\\)|ESCALATED after [0-9]+ days?|CRITICAL|ELEVATED|WARNING|REOPENED|RESOLVED):\\s*',
      '',
      'i'
    ) as problem
  from v_alert_center
  where v_alert_center.resolved_at is null
)
select
  lower(severity) as severity,
  source,
  problem,
  max(days_open) as days_open,
  count(*) as reminders,
  max(ticket_assignee) as owner,
  max(ticket) as ticket,
  max(ticket_status) as ticket_status,
  min(ticket_due) as ticket_due,
  md5((((lower(severity) || '|'::text) || source) || '|'::text) || problem) as alarm_key,
  row_number() over (
    order by (
      case lower(severity)
        when 'critical'::text then 1
        when 'elevated'::text then 2
        else 3
      end
    ),
    (max(days_open)) desc nulls last,
    (count(*)) desc
  ) as rank
from stripped
where problem <> ''::text
group by lower(severity), source, problem;

alter view public.v_five_alarm set (security_invoker = true);

comment on view public.v_five_alarm is
  'One row per distinct unresolved problem, collapsed from v_alert_center reminder rows. Feeds the Five Alarm KPI strip. Reads the existing alert system - it is NOT a second one.';

grant select on public.v_five_alarm to authenticated;
revoke all on public.v_five_alarm from anon, public;
