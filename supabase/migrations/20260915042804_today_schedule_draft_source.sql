-- BP-5-5 People v1 × BP-8: a schedule draft waiting for sign-off is a decision on Today — source 'schedule_draft'
-- from v_schedule_draft_decisions (placed / open / conflicts / people / projected hours as the figure, its conflict
-- and open-shift lines as members), critical when the week starts within three days, offered to the sign-off roles
-- of scheduling_policy (+ admin), options post / discard / assign / defer.
set search_path = public;
CREATE OR REPLACE FUNCTION public.f_today_feed(p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text := public.current_app_role()::text; v_all boolean; v_out jsonb;
begin
  if r is null then raise exception 'Sign in to read Today.' using errcode = '42501'; end if;
  v_all := r in ('owner', 'executive', 'admin');
  with fg as (
    select 'fg|' || f.severity || '|' || public.f_finding_family(f.headline) as key,
           case when bool_and(f.scope like 'BP-13:onboarding:%') then 'onboarding' when bool_and(f.scope like 'qa:%') then 'report' else 'finding_group' end as source, f.severity,
           case when bool_and(f.scope like 'BP-13:onboarding:%') then min(f.headline) else public.f_finding_family(f.headline) end as what,
           string_agg(distinct coalesce(f.agent_key, f.agent), ', ') as why,
           count(*)::int as n, sum(coalesce(f.dollars, 0)) as dollars, sum(coalesce(f.pounds, 0)) as pounds,
           min(f.detected_at) as oldest, max(f.detected_at) as newest,
           (array_agg(f.action order by f.detected_at desc))[1] as recommendation,
           (array_agg(f.drill_to order by f.detected_at desc) filter (where f.drill_to is not null))[1] as drill_to,
           case when bool_and(f.scope like 'BP-13:onboarding:%') then (select i.owner_role from public.onboarding_item i where 'BP-13:onboarding:' || i.key = min(f.scope)) end as who
    from public.agent_findings f
    where f.resolved_at is null and f.severity in ('critical', 'elevated', 'watch')
      and not (f.scope like 'qa:%' and f.headline like 'Enhancement for %')
    group by f.severity, public.f_finding_family(f.headline)
  ), ig as (
    select 'ig|' || i.severity || '|' || regexp_replace(i.issue_key, '[:|].*$', '') as key, 'issue_group', i.severity,
           case when count(*) = 1 then min(i.issue)
                else count(*) || ' issues of kind "' || regexp_replace(min(i.issue_key), '[:|].*$', '') || '" — e.g. ' || min(i.issue) end,
           'forensic watchdog', count(*)::int, sum(coalesce(i.dollars, 0)), sum(coalesce(i.pounds, 0)),
           min(i.first_seen_on)::timestamptz, max(i.last_seen_on)::timestamptz,
           (array_agg(i.what_to_do order by i.last_seen_on desc))[1],
           (array_agg(i.drill order by i.last_seen_on desc) filter (where i.drill is not null))[1],
           string_agg(distinct i.who_is_accountable, '; ')
    from public.v_open_issues i where i.needs_a_decision
    group by i.severity, regexp_replace(i.issue_key, '[:|].*$', '')
  ), q as (
    select 'q|' || o.id, 'question', 'elevated', o.question, coalesce(o.area, 'open question'), 1, 0::numeric, coalesce(o.exposure_lb, 0),
           o.first_seen, o.last_seen, coalesce(o.what_is_blocked, o.why_it_matters), null::text, null::text
    from public.open_questions o where o.status = 'open'
  ), pe as (
    select 'pe|' || e.id, 'enhancement', 'watch', coalesce(e.page, '?') || ': ' || coalesce(e.recommendation, e.observation), coalesce(e.raised_by, 'page review'), 1, 0::numeric, 0::numeric,
           e.raised_at, e.raised_at, coalesce(e.why_it_matters, '') || case when e.impact is not null then ' · impact ' || e.impact else '' end || case when e.effort is not null then ' · effort ' || e.effort else '' end,
           e.page, null::text
    from public.page_enhancement e where e.status = 'proposed'
  ), cp as (
    select 'cp|' || c.id, 'correction', coalesce(c.severity, 'elevated'), c.the_issue, coalesce(c.raised_by, 'correction proposal'), coalesce(c.rows_affected, 1)::int, coalesce(c.dollars_affected, 0), coalesce(c.pounds_affected, 0),
           c.raised_at, c.raised_at, c.the_proposal, c.target_object, null::text
    from public.correction_proposal c where c.status = 'proposed'
  ), qe as (
    select 'qe|' || f.id, 'qa_enhancement', 'watch', f.headline, f.agent, 1, 0::numeric, 0::numeric, f.detected_at, f.detected_at, f.detail, f.drill_to, null::text
    from public.agent_findings f where f.resolved_at is null and f.scope like 'qa:%' and f.headline like 'Enhancement for %'
  ), sd as (
    select 'sd|' || v.id, 'schedule_draft', case when v.covers_from <= current_date + 3 then 'critical' else 'elevated' end,
           v.title || ' — ' || v.placed || ' shifts placed, ' || v.open_shifts || ' open, ' || v.conflicts || ' conflict(s), ' || v.people || ' people, ' || coalesce(round(v.projected_hours)::text, '?') || ' h'
             || case when v.department is not null then ' · ' || v.department else '' end,
           'People v1 (' || v.drafted_by_kind || case when v.agent_name is not null then ' · ' || v.agent_name else '' end || ')', v.lines::int, coalesce(v.projected_cost_loaded, 0), 0::numeric,
           v.created_at, v.created_at,
           case when v.conflicts > 0 then 'Fix the ' || v.conflicts || ' conflict line(s) in the Schedule Builder, then post; or discard with the reason.' else 'Post it — no conflicts; open shifts stay open for claims.' end,
           'hr_platform:/schedule-builder', 'sign-off: ' || array_to_string(v.signoff_roles, ', ')
    from public.v_schedule_draft_decisions v
  ), u as (
    select * from fg union all select * from ig union all select * from q union all select * from pe union all select * from cp union all select * from qe union all select * from sd
  ), deferred as (
    select distinct on (d.key) d.key, d.due_by from public.decisions d
    where d.outcome = 'defer' and d.reversed_at is null and d.due_by >= current_date order by d.key, d.decided_at desc
  ), scored as (
    select u.*, extract(day from now() - u.oldest)::int as age_days,
      (case u.severity when 'critical' then 4 when 'elevated' then 2 else 1 end)
        * (1 + ln(1 + u.dollars / 1000.0))
        * (1 + ln(1 + greatest(extract(day from now() - u.oldest), 0)) / 3.0)
        * (case when u.source = 'onboarding' then greatest(coalesce(public.f_rule('today_onboarding_weight'), 1), 1) else 1 end) as score,
      case u.source
        when 'finding_group' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        when 'onboarding' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        when 'report' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        when 'question' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        when 'schedule_draft' then (select array_agg(distinct x) from unnest(coalesce((select signoff_roles from public.scheduling_policy limit 1), '{owner}'::text[]) || array['admin']) x)
        else array['owner','executive','cfo','admin'] end as may_take,
      case u.source
        when 'finding_group' then '["resolve","assign","defer"]'::jsonb
        when 'onboarding' then '["resolve","assign","defer"]'::jsonb
        when 'report' then '["resolve","assign","defer"]'::jsonb
        when 'issue_group' then '["fix","leave","ignore","assign","defer"]'::jsonb
        when 'question' then '["answer","assign","defer"]'::jsonb
        when 'qa_enhancement' then '["build_now","build_later","no"]'::jsonb
        when 'schedule_draft' then '["post","discard","assign","defer"]'::jsonb
        else '["approved","rejected","deferred"]'::jsonb end as options,
      dd.due_by as deferred_until
    from u left join deferred dd on dd.key = u.key
  ), mine as (
    select * from scored where deferred_until is null and (v_all or r = any(may_take))
  ), ranked as (
    select m.*, row_number() over (order by m.score desc, m.oldest) as rn,
           row_number() over (partition by m.source order by m.score desc, m.oldest) as rs from mine m
  )
  select jsonb_build_object(
    'as_of', now(), 'role', r, 'sees_all', v_all, 'limit', p_limit,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'key', rk.key, 'source', rk.source, 'severity', rk.severity, 'what', rk.what, 'why', rk.why, 'who', rk.who,
        'n', rk.n, 'dollars', rk.dollars, 'pounds', rk.pounds, 'oldest', rk.oldest, 'newest', rk.newest, 'age_days', rk.age_days,
        'score', round(rk.score::numeric, 2), 'recommendation', rk.recommendation, 'drill_to', rk.drill_to,
        'options', rk.options, 'may_take', to_jsonb(rk.may_take), 'rank', rk.rn, 'in_top', rk.rn <= p_limit, 'source_rank', rk.rs,
        'members', case rk.source
          when 'finding_group' then (select jsonb_agg(jsonb_build_object('id', s.id, 'headline', s.headline, 'dollars', s.dollars, 'at', s.detected_at, 'drill_to', s.drill_to)) from (
              select f.id, f.headline, f.dollars, f.detected_at, f.drill_to from public.agent_findings f
              where f.resolved_at is null and f.severity = rk.severity and public.f_finding_family(f.headline) = rk.what
              order by coalesce(f.dollars, 0) desc, f.detected_at desc limit 5) s)
          when 'report' then (select jsonb_agg(jsonb_build_object('id', s.id, 'headline', s.headline, 'detail', s.detail, 'at', s.detected_at, 'drill_to', s.drill_to)) from (
              select f.id, f.headline, left(f.detail, 600) detail, f.detected_at, f.drill_to from public.agent_findings f
              where f.resolved_at is null and f.severity = rk.severity and public.f_finding_family(f.headline) = rk.what
              order by f.detected_at desc limit 5) s)
          when 'onboarding' then (select jsonb_agg(jsonb_build_object('id', s.id, 'headline', s.headline, 'detail', s.detail, 'at', s.detected_at, 'drill_to', s.drill_to)) from (
              select f.id, f.headline, left(f.detail, 600) detail, f.detected_at, f.drill_to from public.agent_findings f
              where f.resolved_at is null and f.agent_key = 'watch:onboarding' and f.headline = rk.what
              order by f.detected_at desc limit 5) s)
          when 'issue_group' then (select jsonb_agg(jsonb_build_object('issue_key', s.issue_key, 'headline', s.issue, 'dollars', s.dollars, 'at', s.last_seen_on, 'drill_to', s.drill)) from (
              select i.issue_key, i.issue, i.dollars, i.last_seen_on, i.drill from public.v_open_issues i
              where i.needs_a_decision and i.severity = rk.severity and regexp_replace(i.issue_key, '[:|].*$', '') = split_part(rk.key, '|', 3)
              order by coalesce(i.dollars, 0) desc, i.last_seen_on desc limit 5) s)
          when 'schedule_draft' then (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'headline', s.headline, 'detail', s.detail, 'at', s.at, 'drill_to', 'hr_platform:/schedule-builder')), '[]'::jsonb) from (
              select l.id, to_char(l.work_date, 'Dy DD Mon') || ' · ' || coalesce(z.name, '?') || ' · ' || coalesce(e.full_name, case when l.is_open_shift then 'OPEN SHIFT' else '—' end) as headline,
                     coalesce(l.conflict, l.note) as detail, l.work_date::timestamptz as at
                from public.schedule_draft_lines l left join public.zones z on z.id = l.zone_id left join public.employees e on e.id = l.employee_id
               where l.draft_id = split_part(rk.key, '|', 2)::uuid and (l.conflict is not null or l.is_open_shift)
               order by (l.conflict is null), l.work_date, z.sort_order limit 5) s)
          else '[]'::jsonb end
      ) order by rk.rn) from ranked rk where rk.rn <= p_limit or rk.rs <= 3), '[]'::jsonb),
    'behind', (select jsonb_build_object('total', count(*), 'shown', least(count(*), p_limit),
                 'by_source', (select jsonb_object_agg(source, n) from (select source, count(*) n from mine group by source) b),
                 'dollars_total', sum(dollars), 'rows_total', sum(n)) from mine),
    'deferred', (select count(*) from scored where deferred_until is not null and (v_all or r = any(may_take))),
    'not_mine', (select count(*) from scored where deferred_until is null and not (v_all or r = any(may_take))),
    'decided_today', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'key', d.key, 'source', d.source, 'what', d.what, 'outcome', d.outcome,
                 'outcome_note', d.outcome_note, 'effect', d.effect, 'decided_role', d.decided_role, 'decided_at', d.decided_at,
                 'reversed_at', d.reversed_at, 'reversal_reason', d.reversal_reason, 'figure', d.figure, 'due_by', d.due_by) order by d.decided_at desc)
                 from public.decisions d where d.decided_at >= (now() at time zone 'America/New_York')::date::timestamp at time zone 'America/New_York'), '[]'::jsonb),
    'push', jsonb_build_object('recipients', (select count(*) from public.alert_recipient where active),
                 'last_sent', (select max(created_at) from public.alert_outbox where source = 'today')))
  into v_out;
  return v_out;
end $function$;
notify pgrst, 'reload schema';;
